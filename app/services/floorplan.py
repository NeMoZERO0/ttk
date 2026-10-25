"""Планировка этажей: комнаты, габариты здания и автоматический граф навигации.

Как строится граф этажа (если на этаже есть хотя бы один коридор или участок территории):
  * у каждого коридора есть осевая линия вдоль длинной стороны;
  * каждая точка этажа (центр комнаты или отдельная POI) проецируется на ближайшую
    осевую линию — там появляется узел коридора («дверь»), точка соединяется с ним;
  * соседние узлы на одной осевой линии соединяются друг с другом;
  * пересекающиеся/соприкасающиеся коридоры соединяются в точке стыка;
  * лестницы и лифты соседних этажей соединяются между собой.
Длина рёбер — в метрах, по габаритам здания из Map.settings.
Этажи без коридоров не трогаем: там остаётся граф, собранный вручную через /nodes и /edges.
"""
import math
from uuid import UUID
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models import Map, Floor, Node, Edge, Room

DEFAULT_WIDTH_M = 60.0
DEFAULT_HEIGHT_M = 42.0
CORRIDOR = "corridor"
# Проходимые зоны: по ним строятся маршруты (коридоры внутри и территория снаружи)
WALKABLE = {"corridor", "outdoor"}
NODE_TYPES = {"stairs", "elevator", "entrance"}
VERTICAL = {"stairs": 8.0, "elevator": 6.0}
MERGE_EPS_M = 0.3      # узлы на осевой ближе этого расстояния склеиваются
TOUCH_TOL_M = 0.6      # насколько коридоры могут не доставать друг до друга, чтобы считаться стыком


# ---------- габариты ----------

def building_size(m: Map) -> tuple[float, float]:
    s = m.settings or {}
    try:
        return float(s.get("width_m", DEFAULT_WIDTH_M)), float(s.get("height_m", DEFAULT_HEIGHT_M))
    except (TypeError, ValueError):
        return DEFAULT_WIDTH_M, DEFAULT_HEIGHT_M


def set_building_size(m: Map, width_m: float, height_m: float) -> None:
    s = dict(m.settings or {})
    s["width_m"], s["height_m"] = float(width_m), float(height_m)
    m.settings = s  # присваиваем новый dict, чтобы SQLAlchemy увидел изменение JSON


def room_area(m: Map, r: Room) -> float:
    wm, hm = building_size(m)
    return round(r.w * wm * r.h * hm, 1)


def room_out(m: Map, r: Room) -> dict:
    return {
        "id": r.id, "map_id": r.map_id, "floor_id": r.floor_id, "node_id": r.node_id,
        "name": r.name, "category": r.category, "description": r.description,
        "x": r.x, "y": r.y, "w": r.w, "h": r.h,
        "points": getattr(r, "points", None),
        "area_m2": room_area(m, r),
    }


def clamp_room(r: Room) -> None:
    """Комната не выходит за пределы здания и не бывает нулевой."""
    r.w = min(max(r.w, 0.002), 1.0)
    r.h = min(max(r.h, 0.002), 1.0)
    r.x = min(max(r.x, 0.0), 1.0 - r.w)
    r.y = min(max(r.y, 0.0), 1.0 - r.h)


# ---------- точка комнаты ----------

def node_type_for(category: str | None) -> str:
    return category if category in NODE_TYPES else "poi"


def sync_room_node(db: Session, m: Map, r: Room) -> None:
    """Создаёт/обновляет точку в центре комнаты (у коридоров точки нет)."""
    node = db.get(Node, r.node_id) if r.node_id else None
    if r.category in WALKABLE:
        if node:
            _delete_node(db, node)
            r.node_id = None
        return
    cx, cy = r.x + r.w / 2, r.y + r.h / 2
    if node is None:
        node = Node(map_id=m.id, floor_id=r.floor_id, name=r.name, x=cx, y=cy, meta={})
        db.add(node)
    node.floor_id = r.floor_id
    node.name = r.name
    node.description = r.description
    node.category = r.category
    node.type = node_type_for(r.category)
    node.x, node.y = cx, cy
    db.flush()
    r.node_id = node.id


def _delete_node(db: Session, node: Node) -> None:
    # Рёбра удаляем явно: в SQLite каскад по внешним ключам выключен
    db.query(Edge).filter(or_(Edge.from_node_id == node.id, Edge.to_node_id == node.id)).delete(synchronize_session=False)
    db.query(Room).filter_by(node_id=node.id).update({"node_id": None}, synchronize_session=False)
    db.delete(node)


def delete_room(db: Session, r: Room) -> None:
    node = db.get(Node, r.node_id) if r.node_id else None
    db.delete(r)
    if node:
        db.flush()
        _delete_node(db, node)


# ---------- граф ----------

class _Line:
    """Осевая линия коридора. Параметр t — координата вдоль оси (доля габарита)."""

    def __init__(self, r: Room, wm: float, hm: float):
        self.room = r
        self.horizontal = r.w * wm >= r.h * hm
        if self.horizontal:
            self.c, self.t0, self.t1, self.scale = r.y + r.h / 2, r.x, r.x + r.w, wm
        else:
            self.c, self.t0, self.t1, self.scale = r.x + r.w / 2, r.y, r.y + r.h, hm
        self.ts: list[float] = []

    def project(self, x: float, y: float) -> float:
        return min(max(x if self.horizontal else y, self.t0), self.t1)

    def point(self, t: float) -> tuple[float, float]:
        return (t, self.c) if self.horizontal else (self.c, t)


def _dist_m(ax, ay, bx, by, wm, hm) -> float:
    return round(math.hypot((ax - bx) * wm, (ay - by) * hm), 2)


def _rects_touch(a: Room, b: Room, wm: float, hm: float) -> tuple[float, float] | None:
    """Центр области стыка двух коридоров или None."""
    tx, ty = TOUCH_TOL_M / wm, TOUCH_TOL_M / hm
    x0, x1 = max(a.x, b.x), min(a.x + a.w, b.x + b.w)
    y0, y1 = max(a.y, b.y), min(a.y + a.h, b.y + b.h)
    if x1 < x0 - tx or y1 < y0 - ty:
        return None
    return ((x0 + x1) / 2, (y0 + y1) / 2)


def rebuild_floor_graph(db: Session, m: Map, floor_id: UUID) -> None:
    wm, hm = building_size(m)
    corridors = db.query(Room).filter(Room.map_id == m.id, Room.floor_id == floor_id,
                                      Room.category.in_(WALKABLE)).all()
    if not corridors:
        return

    floor_nodes = db.query(Node).filter_by(map_id=m.id, floor_id=floor_id).all()
    floor_ids = [n.id for n in floor_nodes]
    old_corridor = [n for n in floor_nodes if n.type == "corridor"]
    old_ids = [n.id for n in old_corridor]

    # 1. Снести прежний граф этажа: рёбра внутри этажа и все узлы коридоров
    if floor_ids:
        db.query(Edge).filter(Edge.map_id == m.id, Edge.from_node_id.in_(floor_ids),
                              Edge.to_node_id.in_(floor_ids)).delete(synchronize_session=False)
    if old_ids:
        db.query(Edge).filter(or_(Edge.from_node_id.in_(old_ids), Edge.to_node_id.in_(old_ids))) \
            .delete(synchronize_session=False)
        for n in old_corridor:
            db.delete(n)
    db.flush()

    lines = [_Line(r, wm, hm) for r in corridors]
    points = [n for n in floor_nodes if n.type != "corridor"]

    # 2. Где точки примыкают к коридорам
    attach = []
    for p in points:
        best = None
        for ln in lines:
            t = ln.project(p.x, p.y)
            qx, qy = ln.point(t)
            d = _dist_m(p.x, p.y, qx, qy, wm, hm)
            if best is None or d < best[0]:
                best = (d, ln, t)
        _, ln, t = best
        ln.ts.append(t)
        attach.append((p, ln, t))

    # 3. Стыки коридоров
    joints = []
    for i in range(len(lines)):
        for j in range(i + 1, len(lines)):
            c = _rects_touch(lines[i].room, lines[j].room, wm, hm)
            if c:
                ti, tj = lines[i].project(*c), lines[j].project(*c)
                lines[i].ts.append(ti)
                lines[j].ts.append(tj)
                joints.append((lines[i], ti, lines[j], tj))

    # 4. Узлы на осевых линиях
    def add_edge(a: Node, b: Node, dist: float | None = None):
        if a.id == b.id:
            return
        db.add(Edge(map_id=m.id, from_node_id=a.id, to_node_id=b.id, bidirectional=True,
                    distance=dist if dist is not None else _dist_m(a.x, a.y, b.x, b.y, wm, hm)))

    for ln in lines:
        ln.nodes = []  # [(t, Node)]
        for t in sorted(ln.ts):
            if ln.nodes and abs(t - ln.nodes[-1][0]) * ln.scale < MERGE_EPS_M:
                continue
            x, y = ln.point(t)
            n = Node(map_id=m.id, floor_id=floor_id, type="corridor", name="Коридор",
                     x=round(x, 5), y=round(y, 5), meta={})
            db.add(n)
            ln.nodes.append((t, n))
    db.flush()

    def node_at(ln: _Line, t: float) -> Node:
        return min(ln.nodes, key=lambda tn: abs(tn[0] - t))[1]

    for ln in lines:
        for (_, a), (_, b) in zip(ln.nodes, ln.nodes[1:]):
            add_edge(a, b)
    for p, ln, t in attach:
        add_edge(p, node_at(ln, t))
    for li, ti, lj, tj in joints:
        add_edge(node_at(li, ti), node_at(lj, tj))
    db.flush()


def link_vertical(db: Session, m: Map) -> None:
    """Соединяет лестницы и лифты соседних этажей (если связи ещё нет)."""
    wm, hm = building_size(m)
    floors = db.query(Floor).filter_by(map_id=m.id).order_by(Floor.level).all()
    for kind, dist in VERTICAL.items():
        by_floor = [db.query(Node).filter_by(map_id=m.id, floor_id=f.id, type=kind).all() for f in floors]
        for lower, upper in zip(by_floor, by_floor[1:]):
            for a in lower:
                if not upper:
                    break
                b = min(upper, key=lambda n: _dist_m(a.x, a.y, n.x, n.y, wm, hm))
                exists = db.query(Edge).filter(or_(
                    (Edge.from_node_id == a.id) & (Edge.to_node_id == b.id),
                    (Edge.from_node_id == b.id) & (Edge.to_node_id == a.id),
                )).first()
                if not exists:
                    db.add(Edge(map_id=m.id, from_node_id=a.id, to_node_id=b.id,
                                distance=dist, bidirectional=True))
    db.flush()


def rebuild_map_graph(db: Session, m: Map, floor_ids: list[UUID] | None = None) -> None:
    if floor_ids is None:
        floor_ids = [f.id for f in db.query(Floor).filter_by(map_id=m.id).all()]
    for fid in floor_ids:
        rebuild_floor_graph(db, m, fid)
    link_vertical(db, m)
