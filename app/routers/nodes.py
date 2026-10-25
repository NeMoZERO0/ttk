from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from app import schemas
from app.database import get_db
from app.models import User, Node, Floor
from app.deps import get_current_user
from app.routers.maps import _own_map
from app.services.floorplan import rebuild_map_graph, _delete_node

router = APIRouter(prefix="/maps/{map_id}/nodes", tags=["nodes"])

@router.post("", response_model=schemas.NodeOut)
def create_node(map_id: UUID, data: schemas.NodeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    f = db.get(Floor, data.floor_id)
    if not f or f.map_id != map_id:
        raise HTTPException(400, "Floor not in this map")
    m = _own_map(map_id, user, db)
    n = Node(map_id=map_id, **data.model_dump())
    db.add(n); db.flush()
    # Новая точка сама подключается к коридорам этажа (если они размечены в редакторе)
    rebuild_map_graph(db, m, [n.floor_id])
    db.commit(); db.refresh(n)
    return n

@router.get("", response_model=list[schemas.NodeOut])
def list_nodes(map_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    return db.query(Node).filter_by(map_id=map_id).all()

@router.patch("/{node_id}", response_model=schemas.NodeOut)
def update_node(map_id: UUID, node_id: UUID, data: schemas.NodeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    n = db.get(Node, node_id)
    if not n or n.map_id != map_id:
        raise HTTPException(404)
    m = _own_map(map_id, user, db)
    f = db.get(Floor, data.floor_id)
    if not f or f.map_id != map_id:
        raise HTTPException(400, "Floor not in this map")
    old_floor = n.floor_id
    for k, v in data.model_dump().items():
        setattr(n, k, v)
    db.flush()
    rebuild_map_graph(db, m, list({old_floor, n.floor_id}))
    db.commit(); db.refresh(n)
    return n

@router.delete("/{node_id}", status_code=204)
def delete_node(map_id: UUID, node_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = _own_map(map_id, user, db)
    n = db.get(Node, node_id)
    if n and n.map_id == m.id:  # только точки своей карты
        floor_id = n.floor_id
        _delete_node(db, n)  # вместе с рёбрами (в SQLite нет каскада)
        db.flush()
        rebuild_map_graph(db, m, [floor_id])
        db.commit()