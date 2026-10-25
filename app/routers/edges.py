from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from app import schemas
from app.database import get_db
from app.models import User, Edge, Node
from app.deps import get_current_user
from app.routers.maps import _own_map

router = APIRouter(prefix="/maps/{map_id}/edges", tags=["edges"])

@router.post("", response_model=schemas.EdgeOut)
def create_edge(map_id: UUID, data: schemas.EdgeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    a = db.get(Node, data.from_node_id)
    b = db.get(Node, data.to_node_id)
    if not a or not b or a.map_id != map_id or b.map_id != map_id:
        raise HTTPException(400, "Both nodes must belong to the map")
    if a.id == b.id:
        raise HTTPException(400, "Cannot connect a node to itself")
    e = Edge(map_id=map_id, **data.model_dump())
    db.add(e); db.commit(); db.refresh(e)
    return e

@router.get("", response_model=list[schemas.EdgeOut])
def list_edges(map_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    return db.query(Edge).filter_by(map_id=map_id).all()

@router.delete("/{edge_id}", status_code=204)
def delete_edge(map_id: UUID, edge_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    e = db.get(Edge, edge_id)
    if e and e.map_id == map_id:  # только рёбра своей карты
        db.delete(e); db.commit()