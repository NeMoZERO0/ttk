from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import uuid4, UUID
from PIL import Image
from io import BytesIO
from app import schemas
from app.database import get_db
from app.models import User, Floor
from app.deps import get_current_user
from app.routers.maps import _own_map
from app.storage import presign_put, s3
from app.config import settings

router = APIRouter(prefix="/maps/{map_id}/floors", tags=["floors"])

@router.post("", response_model=schemas.FloorOut)
def create_floor(map_id: UUID, data: schemas.FloorCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    f = Floor(map_id=map_id, name=data.name, level=data.level)
    db.add(f)
    db.commit()
    db.refresh(f)
    return f

@router.get("", response_model=list[schemas.FloorOut])
def list_floors(map_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    return db.query(Floor).filter_by(map_id=map_id).order_by(Floor.level).all()

@router.post("/{floor_id}/plan", response_model=schemas.PlanUploadOut)
def plan_upload(map_id: UUID, floor_id: UUID, data: schemas.PlanUploadIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    if data.content_type not in ("image/png", "image/jpeg"):
        raise HTTPException(400, "Only PNG/JPEG")
    f = db.get(Floor, floor_id)
    if not f or f.map_id != map_id:
        raise HTTPException(404, "Floor not found")
    key = f"plans/{map_id}/{floor_id}/{uuid4()}.jpg"
    f.plan_image_key = key
    db.commit()
    return {"upload_url": presign_put(key, data.content_type), "key": key}

@router.post("/{floor_id}/plan/finalize", response_model=schemas.FloorOut)
def plan_finalize(map_id: UUID, floor_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    f = db.get(Floor, floor_id)
    if not f or not f.plan_image_key:
        raise HTTPException(404, "No plan uploaded")
    try:
        obj = s3.get_object(Bucket=settings.s3_bucket, Key=f.plan_image_key)
        img = Image.open(BytesIO(obj["Body"].read()))
        f.width, f.height = img.size
        db.commit()
        db.refresh(f)
    except Exception as e:
        raise HTTPException(400, f"Error reading image: {e}")
    return f