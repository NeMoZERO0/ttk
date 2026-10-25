"""Планы этажей, панорамы, метки на панорамах, файлы и статистика.

Панорама хранится как равнопромежуточное изображение 2:1 (полное 4096×2048 и превью 1024×512).
Положение панорамы на плане — точка (Node) с type="viewpoint" и panorama_id.
Панорамы — только настоящие снимки: пошаговая съёмка телефоном или готовый файл.
"""
import io
from collections import Counter
from datetime import datetime, timedelta
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.deps import get_current_user
from app.models import Floor, Map, MapEvent, Node, PanoHotspot, Panorama, Room, User
from app.routers.maps import _own_map
from app.services.floorplan import _delete_node, building_size, rebuild_map_graph, set_building_size
from app.storage import delete_key, file_url, get_bytes, put_bytes

router = APIRouter(tags=["media"])

MAX_UPLOAD = 25 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 120_000_000


# ---------- файлы ----------

@router.get("/files/{key:path}")
def get_file(key: str):
    if not key.startswith(("plans/", "panoramas/")) or ".." in key:
        raise HTTPException(404)
    got = get_bytes(key)
    if not got:
        raise HTTPException(404)
    data, ctype = got
    # Ключи файлов уникальны (uuid), поэтому кэшировать можно «навсегда»
    return Response(content=data, media_type=ctype,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


async def _read_image(file: UploadFile) -> Image.Image:
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Файл больше 25 МБ")
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        img.load()
    except Exception:
        raise HTTPException(400, "Не удалось прочитать изображение (нужен JPEG, PNG или WebP)")
    return img


def _jpeg(img: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


# ---------- план этажа ----------

@router.post("/maps/{map_id}/floors/{floor_id}/plan/upload")
async def upload_plan(map_id: UUID, floor_id: UUID, file: UploadFile = File(...), fit_building: bool = Form(True),
                      db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Готовый план (картинка) — подложка для разметки помещений."""
    m = _own_map(map_id, user, db)
    f = db.get(Floor, floor_id)
    if not f or f.map_id != m.id:
        raise HTTPException(404, "Floor not found")
    img = await _read_image(file)
    img.thumbnail((4096, 4096))
    is_png = (img.format or "").upper() == "PNG" or img.mode in ("RGBA", "LA", "P")
    if is_png:
        buf = io.BytesIO()
        img.save(buf, "PNG", optimize=True)
        data, ctype, ext = buf.getvalue(), "image/png", "png"
    else:
        data, ctype, ext = _jpeg(img, 88), "image/jpeg", "jpg"
    old = f.plan_image_key
    key = f"plans/{m.id}/{f.id}/{uuid4()}.{ext}"
    put_bytes(key, data, ctype)
    f.plan_image_key = key
    f.width, f.height = img.size
    if fit_building and db.query(Room).filter_by(map_id=m.id).first() is None:
        # Пропорции здания подгоняем под картинку (ширина в метрах сохраняется).
        # Если помещения уже размечены — не трогаем, иначе разметка «поедет».
        wm, _ = building_size(m)
        set_building_size(m, wm, round(wm * img.size[1] / img.size[0], 2))
        db.flush()
        rebuild_map_graph(db, m)
    db.commit()
    delete_key(old)
    wm, hm = building_size(m)
    return {"floor_id": f.id, "plan_url": file_url(key), "width": f.width, "height": f.height,
            "building": {"width_m": wm, "height_m": hm}}


@router.delete("/maps/{map_id}/floors/{floor_id}/plan", status_code=204)
def delete_plan(map_id: UUID, floor_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    f = db.get(Floor, floor_id)
    if not f or f.map_id != m.id:
        raise HTTPException(404)
    old = f.plan_image_key
    f.plan_image_key, f.width, f.height = None, None, None
    db.commit()
    delete_key(old)


# ---------- панорамы ----------

def _to_equirect(img: Image.Image, hfov: float) -> Image.Image:
    """Приводит снимок к панораме 2:1. hfov — сколько градусов по горизонтали охватывает снимок
    (360 — полная сферическая панорама; меньше — полоса из режима «Панорама» телефона)."""
    img = img.convert("RGB")
    w, h = img.size
    out_w = 4096 if w * 360 / hfov >= 2500 else 2048
    out_h = out_w // 2
    if hfov >= 359 and abs(w / h - 2) < 0.05:
        return img.resize((out_w, out_h), Image.LANCZOS)
    if hfov >= 359 and w / h < 1.95:
        raise HTTPException(400, "Это не панорама 360°: нужна картинка с пропорциями 2:1 или шире. "
                                 "Для обычных фото используйте пошаговую съёмку в редакторе.")
    # Цилиндрическая полоса: по вертикали охват ≈ hfov * h / w
    band_w = round(out_w * hfov / 360)
    band_h = min(out_h, round(band_w * h / w))
    band = img.resize((band_w, band_h), Image.LANCZOS)
    top = band.crop((0, 0, band_w, max(1, band_h // 20))).resize((1, 1), Image.BOX).getpixel((0, 0))
    bottom = band.crop((0, band_h - max(1, band_h // 20), band_w, band_h)).resize((1, 1), Image.BOX).getpixel((0, 0))
    canvas = Image.new("RGB", (out_w, out_h), top)
    lower = Image.new("RGB", (out_w, out_h // 2), bottom)
    canvas.paste(lower, (0, out_h // 2))
    canvas.paste(band, ((out_w - band_w) // 2, (out_h - band_h) // 2))
    return canvas


def _viewpoint(db: Session, p: Panorama) -> Node | None:
    nodes = db.query(Node).filter_by(panorama_id=p.id).all()
    return next((n for n in nodes if n.type == "viewpoint"), nodes[0] if nodes else None)


def pano_out(db: Session, p: Panorama) -> dict:
    vp = _viewpoint(db, p)
    hs = db.query(PanoHotspot).filter_by(panorama_id=p.id).all()
    return {
        "id": p.id, "status": p.status, "yaw": p.yaw, "pitch": p.pitch, "hfov": p.hfov,
        "url": file_url(p.image_key), "preview_url": file_url(p.preview_key),
        "node_id": vp.id if vp else None,
        "floor_id": vp.floor_id if vp else p.floor_id,
        "x": vp.x if vp else None, "y": vp.y if vp else None,
        "name": vp.name if vp else "Панорама",
        "hotspots": [{"id": h.id, "yaw": h.yaw, "pitch": h.pitch, "title": h.title,
                      "description": h.description} for h in hs],
    }


def _create_pano(db: Session, m: Map, user: User, floor_id: UUID, name: str, x: float, y: float,
                 full: bytes, preview: bytes) -> Panorama:
    f = db.get(Floor, floor_id)
    if not f or f.map_id != m.id:
        raise HTTPException(400, "Floor not in this map")
    p = Panorama(map_id=m.id, floor_id=f.id, owner_id=user.id, status="ready", yaw=0.0, pitch=0.0, hfov=90.0)
    db.add(p)
    db.flush()
    p.image_key = f"panoramas/{m.id}/{p.id}/full-{uuid4().hex[:8]}.jpg"
    p.preview_key = f"panoramas/{m.id}/{p.id}/preview-{uuid4().hex[:8]}.jpg"
    put_bytes(p.image_key, full, "image/jpeg")
    put_bytes(p.preview_key, preview, "image/jpeg")
    vp = Node(map_id=m.id, floor_id=f.id, type="viewpoint", name=name, x=x, y=y, panorama_id=p.id,
              category="panorama", meta={})
    db.add(vp)
    db.flush()
    rebuild_map_graph(db, m, [f.id])
    return p


@router.get("/maps/{map_id}/panoramas")
def list_panos(map_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    return [pano_out(db, p) for p in db.query(Panorama).filter_by(map_id=m.id, status="ready").all()]


@router.post("/maps/{map_id}/panoramas/upload")
async def upload_pano(map_id: UUID, file: UploadFile = File(...), floor_id: UUID = Form(...),
                      x: float = Form(0.5), y: float = Form(0.5), name: str = Form("Панорама"),
                      hfov: float = Form(360), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Готовая панорама 360° (2:1), полоса из режима «Панорама» телефона (hfov<360)
    или результат пошаговой съёмки, склеенный в браузере."""
    m = _own_map(map_id, user, db)
    if not (0 <= x <= 1 and 0 <= y <= 1) or not (30 <= hfov <= 360):
        raise HTTPException(422, "Неверные параметры")
    img = _to_equirect(await _read_image(file), hfov)
    full = _jpeg(img, 84)
    preview = _jpeg(img.resize((1024, 512), Image.LANCZOS), 76)
    p = _create_pano(db, m, user, floor_id, name.strip()[:255] or "Панорама", x, y, full, preview)
    db.commit()
    return pano_out(db, p)


def _own_pano(db: Session, m: Map, pano_id: UUID) -> Panorama:
    p = db.get(Panorama, pano_id)
    if not p or p.map_id != m.id:
        raise HTTPException(404, "Panorama not found")
    return p


@router.patch("/maps/{map_id}/panoramas/{pano_id}")
def patch_pano(map_id: UUID, pano_id: UUID, data: schemas.PanoPatch, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    p = _own_pano(db, m, pano_id)
    vp = _viewpoint(db, p)
    patch = data.model_dump(exclude_unset=True)
    if "yaw" in patch and patch["yaw"] is not None:
        p.yaw = ((patch["yaw"] + 180) % 360) - 180
    floors_to_rebuild = set()
    if vp is not None:
        if vp.floor_id:
            floors_to_rebuild.add(vp.floor_id)
        if patch.get("name"):
            vp.name = patch["name"]
        if patch.get("floor_id"):
            f = db.get(Floor, patch["floor_id"])
            if not f or f.map_id != m.id:
                raise HTTPException(400, "Floor not in this map")
            vp.floor_id = p.floor_id = f.id
            floors_to_rebuild.add(f.id)
        if patch.get("x") is not None:
            vp.x = patch["x"]
        if patch.get("y") is not None:
            vp.y = patch["y"]
    db.flush()
    if floors_to_rebuild and any(k in patch for k in ("x", "y", "floor_id")):
        rebuild_map_graph(db, m, list(floors_to_rebuild))
    db.commit()
    return pano_out(db, p)


def remove_panorama(db: Session, m: Map, p: Panorama) -> list[str]:
    """Удаляет панораму с метками и точкой съёмки, перестраивает граф. Возвращает ключи файлов."""
    keys = [k for k in (p.image_key, p.preview_key) if k]
    floors = set()
    db.query(PanoHotspot).filter_by(panorama_id=p.id).delete(synchronize_session=False)
    for n in db.query(Node).filter_by(panorama_id=p.id).all():
        floors.add(n.floor_id)
        if n.type == "viewpoint":
            _delete_node(db, n)
        else:
            n.panorama_id = None
    db.flush()
    db.delete(p)
    db.flush()
    if floors:
        rebuild_map_graph(db, m, list(floors))
    return keys


@router.delete("/maps/{map_id}/panoramas/{pano_id}", status_code=204)
def delete_pano(map_id: UUID, pano_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    p = _own_pano(db, m, pano_id)
    keys = remove_panorama(db, m, p)
    db.commit()
    for k in keys:
        delete_key(k)


# ---------- метки на панорамах ----------

@router.post("/maps/{map_id}/panoramas/{pano_id}/hotspots")
def add_hotspot(map_id: UUID, pano_id: UUID, data: schemas.HotspotIn, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    p = _own_pano(db, m, pano_id)
    h = PanoHotspot(map_id=m.id, panorama_id=p.id, **data.model_dump())
    db.add(h)
    db.commit()
    return pano_out(db, p)


@router.patch("/maps/{map_id}/panoramas/{pano_id}/hotspots/{hs_id}")
def patch_hotspot(map_id: UUID, pano_id: UUID, hs_id: UUID, data: schemas.HotspotPatch,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    p = _own_pano(db, m, pano_id)
    h = db.get(PanoHotspot, hs_id)
    if not h or h.panorama_id != p.id:
        raise HTTPException(404)
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == "title" and v is None:
            continue
        setattr(h, k, v)
    db.commit()
    return pano_out(db, p)


@router.delete("/maps/{map_id}/panoramas/{pano_id}/hotspots/{hs_id}")
def delete_hotspot(map_id: UUID, pano_id: UUID, hs_id: UUID, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    p = _own_pano(db, m, pano_id)
    h = db.get(PanoHotspot, hs_id)
    if h and h.panorama_id == p.id:
        db.delete(h)
        db.commit()
    return pano_out(db, p)


# ---------- статистика ----------

@router.get("/maps/{map_id}/stats")
def stats(map_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    since = datetime.utcnow() - timedelta(days=13)
    events = db.query(MapEvent).filter(MapEvent.map_id == m.id).all()
    totals = Counter(e.kind for e in events)
    days = Counter(e.created_at.date().isoformat() for e in events
                   if e.kind == "view" and e.created_at >= since)
    series = []
    for i in range(14):
        d = (since + timedelta(days=i)).date().isoformat()
        series.append({"date": d, "views": days.get(d, 0)})
    by_node = Counter(e.node_id for e in events if e.kind in ("poi", "route") and e.node_id)
    names = {n.id: n.name for n in db.query(Node).filter(Node.id.in_(list(by_node))).all()} if by_node else {}
    top = [{"node_id": nid, "name": names.get(nid, "Удалённая точка"), "count": c}
           for nid, c in by_node.most_common(5)]
    return {"totals": {k: totals.get(k, 0) for k in ("view", "poi", "route", "pano")},
            "views_by_day": series, "top_places": top}
