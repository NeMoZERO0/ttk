import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import schemas
from app.database import get_db
from app.models import User, Map
from app.deps import get_current_user

router = APIRouter(prefix="/maps", tags=["maps"])

def _slug() -> str:
    return secrets.token_urlsafe(8)

def _own_map(map_id, user, db) -> Map:
    m = db.get(Map, map_id)
    if not m:
        raise HTTPException(404, "Map not found")
    if m.owner_id != user.id:
        raise HTTPException(403, "Forbidden")
    return m

def _map_out(m: Map) -> dict:
    addr = (m.settings or {}).get("address", "") if isinstance(m.settings, dict) else ""
    return {
        "id": m.id,
        "title": m.title,
        "slug": m.slug,
        "status": m.status,
        "published_version": m.published_version,
        "created_at": m.created_at,
        "settings": m.settings,
        "address": addr,
    }

@router.post("", response_model=schemas.MapOut)
def create_map(data: schemas.MapCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    settings = {}
    if data.address:
        settings["address"] = data.address.strip()
    m = Map(owner_id=user.id, title=data.title, slug=_slug(), settings=settings)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _map_out(m)

@router.get("", response_model=list[schemas.MapOut])
def list_maps(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    maps = db.query(Map).filter_by(owner_id=user.id).order_by(Map.created_at.desc()).all()
    return [_map_out(m) for m in maps]

@router.get("/{map_id}", response_model=schemas.MapOut)
def get_map(map_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _map_out(_own_map(map_id, user, db))

@router.delete("/{map_id}", status_code=204)
def delete_map(map_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    db.delete(m)
    db.commit()