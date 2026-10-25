from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import schemas
from app.database import get_db
from app.deps import get_current_user
from app.models import Map, Floor, Node, Panorama, Room, MapEvent, User
from app.services.floorplan import building_size, room_out
from app.services.routing import shortest_path
from app.storage import file_url

router = APIRouter(prefix="/public", tags=["public"])


def _published(slug: str, db: Session) -> Map:
    m = db.query(Map).filter_by(slug=slug, status="published").first()
    if not m:
        raise HTTPException(404, "Map not found")
    return m


def _node_out(n: Node) -> dict:
    return {
        "id": n.id, "floor_id": n.floor_id, "type": n.type,
        "name": n.name, "description": n.description,
        "category": n.category, "x": n.x, "y": n.y,
        "panorama_id": n.panorama_id,
        "meta": n.meta or {},
    }


@router.get("/maps")
def list_published(db: Session = Depends(get_db)):
    """Список опубликованных карт — чтобы экран посетителя знал, что показывать."""
    maps = db.query(Map).filter_by(status="published").order_by(Map.created_at.desc()).all()
    result = []
    for m in maps:
        floors = db.query(Floor).filter_by(map_id=m.id).count()
        rooms = db.query(Room).filter_by(map_id=m.id).count()
        addr = (m.settings or {}).get("address", "") if isinstance(m.settings, dict) else ""
        result.append({
            "id": m.id, "title": m.title, "slug": m.slug,
            "version": m.published_version, "floors_count": floors,
            "rooms_count": rooms,
            "address": addr,
            "settings": m.settings,
        })
    return result


@router.post("/maps/{slug}/publish")
def publish(slug: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Публикация — только владельцем карты. Ссылка (slug) при этом не меняется,
    а дальнейшие правки сразу видны по ней же."""
    m = db.query(Map).filter_by(slug=slug).first()
    if not m:
        raise HTTPException(404)
    if m.owner_id != user.id:
        raise HTTPException(403, "Forbidden")
    if not db.query(Floor).filter_by(map_id=m.id).first():
        raise HTTPException(400, "No floors")
    m.status = "published"
    m.published_version += 1
    db.commit()
    return {"version": m.published_version, "slug": m.slug}


@router.get("/maps/{slug}")
def get_public(slug: str, db: Session = Depends(get_db)):
    from app.routers.media import pano_out  # локальный импорт: избегаем циклического импорта

    m = _published(slug, db)
    floors = db.query(Floor).filter_by(map_id=m.id).order_by(Floor.level).all()
    nodes = db.query(Node).filter_by(map_id=m.id).all()
    panos = db.query(Panorama).filter_by(map_id=m.id, status="ready").all()
    rooms = db.query(Room).filter_by(map_id=m.id).all()
    width_m, height_m = building_size(m)
    addr = (m.settings or {}).get("address", "") if isinstance(m.settings, dict) else ""

    return {
        "id": m.id,
        "title": m.title,
        "slug": m.slug,
        "address": addr,
        "version": m.published_version,
        "building": {"width_m": width_m, "height_m": height_m},
        "rooms": [room_out(m, r) for r in rooms],
        "floors": [
            {
                "id": f.id, "level": f.level, "name": f.name,
                "width": f.width, "height": f.height,
                "plan_url": file_url(f.plan_image_key),
            } for f in floors
        ],
        "nodes": [_node_out(n) for n in nodes],
        "panoramas": [pano_out(db, p) for p in panos],
    }


@router.get("/maps/{slug}/nodes")
def list_public_nodes(slug: str, floor_id: UUID | None = None, include_corridors: bool = False,
                      db: Session = Depends(get_db)):
    """Точки карты (опционально — одного этажа). Узлы коридоров по умолчанию скрыты."""
    m = _published(slug, db)
    q = db.query(Node).filter_by(map_id=m.id)
    if floor_id:
        q = q.filter_by(floor_id=floor_id)
    if not include_corridors:
        q = q.filter(Node.type != "corridor")
    return [_node_out(n) for n in q.all()]


@router.post("/maps/{slug}/route")
def route(slug: str, body: schemas.RouteIn, db: Session = Depends(get_db)):
    m = _published(slug, db)
    path = shortest_path(m.id, body.from_node_id, body.to_node_id, db)
    if not path:
        raise HTTPException(404, "No path found")
    return path


@router.post("/maps/{slug}/events", status_code=204)
def track(slug: str, body: schemas.EventIn, db: Session = Depends(get_db)):
    """Анонимная статистика: просмотр карты, открытие точки, маршрут, панорама."""
    m = db.query(Map).filter_by(slug=slug, status="published").first()
    if not m:
        return
    db.add(MapEvent(map_id=m.id, kind=body.kind, node_id=body.node_id))
    db.commit()
