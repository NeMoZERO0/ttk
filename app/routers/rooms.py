from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import schemas
from app.database import get_db
from app.models import User, Room, Floor
from app.deps import get_current_user
from app.routers.maps import _own_map
from app.services.floorplan import (
    building_size, set_building_size, room_out, clamp_room, sync_room_node,
    delete_room, rebuild_map_graph,
)

router = APIRouter(prefix="/maps/{map_id}", tags=["rooms"])


@router.get("/building", response_model=schemas.BuildingOut)
def get_building(map_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    w, h = building_size(m)
    return {"width_m": w, "height_m": h}


@router.put("/building", response_model=schemas.BuildingOut)
def put_building(map_id: UUID, data: schemas.BuildingIn, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    """Габариты здания в метрах. Комнаты хранятся в долях, поэтому их площади пересчитаются."""
    m = _own_map(map_id, user, db)
    set_building_size(m, data.width_m, data.height_m)
    db.flush()
    rebuild_map_graph(db, m)  # длины рёбер зависят от габаритов
    db.commit()
    return data


@router.get("/rooms", response_model=list[schemas.RoomOut])
def list_rooms(map_id: UUID, floor_id: UUID | None = None, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    q = db.query(Room).filter_by(map_id=m.id)
    if floor_id:
        q = q.filter_by(floor_id=floor_id)
    return [room_out(m, r) for r in q.all()]


@router.post("/rooms", response_model=schemas.RoomOut)
def create_room(map_id: UUID, data: schemas.RoomIn, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    f = db.get(Floor, data.floor_id)
    if not f or f.map_id != m.id:
        raise HTTPException(400, "Floor not in this map")
    r = Room(map_id=m.id, **data.model_dump())
    clamp_room(r)
    db.add(r)
    db.flush()
    sync_room_node(db, m, r)
    rebuild_map_graph(db, m, [r.floor_id])
    db.commit()
    db.refresh(r)
    return room_out(m, r)


@router.patch("/rooms/{room_id}", response_model=schemas.RoomOut)
def update_room(map_id: UUID, room_id: UUID, data: schemas.RoomPatch, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    r = db.get(Room, room_id)
    if not r or r.map_id != m.id:
        raise HTTPException(404, "Room not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == "name" and v is None:
            continue
        setattr(r, k, v)
    if not r.category:
        r.category = "room"
    clamp_room(r)
    db.flush()
    sync_room_node(db, m, r)
    rebuild_map_graph(db, m, [r.floor_id])
    db.commit()
    db.refresh(r)
    return room_out(m, r)


@router.delete("/rooms/{room_id}", status_code=204)
def remove_room(map_id: UUID, room_id: UUID, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    r = db.get(Room, room_id)
    if not r or r.map_id != m.id:
        return
    floor_id = r.floor_id
    delete_room(db, r)
    db.flush()
    rebuild_map_graph(db, m, [floor_id])
    db.commit()

