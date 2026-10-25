from uuid import uuid4, UUID
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from PIL import Image
from app import schemas
from app.database import get_db
from app.models import User, Panorama, Node
from app.deps import get_current_user
from app.routers.maps import _own_map
from app.storage import presign_put, s3, upload_fileobj
from app.config import settings

router = APIRouter(prefix="/maps/{map_id}/panoramas", tags=["panoramas"])

@router.post("", response_model=schemas.PanoramaUploadOut)
def create_pano(map_id: UUID, data: schemas.PanoramaCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    p = Panorama(map_id=map_id, owner_id=user.id, floor_id=data.floor_id, status="uploading")
    db.add(p); db.commit(); db.refresh(p)
    key = f"panoramas/{map_id}/{p.id}/original.jpg"
    return {"panorama_id": p.id, "upload_url": presign_put(key, data.content_type), "key": key}

@router.post("/{pano_id}/finalize", response_model=schemas.PanoramaOut)
def finalize(map_id: UUID, pano_id: UUID, key: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    p = db.get(Panorama, pano_id)
    if not p or p.map_id != map_id:
        raise HTTPException(404)
    try:
        obj = s3.get_object(Bucket=settings.s3_bucket, Key=key)
        data = obj["Body"].read()
        img = Image.open(BytesIO(data))
        w, h = img.size
        if abs((w / h) - 2.0) > 0.05:
            raise HTTPException(400, "Equirectangular panorama must be 2:1")
        preview = img.copy(); preview.thumbnail((2048, 1024))
        buf = BytesIO(); preview.save(buf, format="JPEG", quality=85); buf.seek(0)
        preview_key = f"panoramas/{map_id}/{pano_id}/preview.jpg"
        upload_fileobj(buf, preview_key, "image/jpeg")
        p.image_key = key
        p.preview_key = preview_key
        p.status = "ready"
        db.commit(); db.refresh(p)
    except Exception as e:
        raise HTTPException(400, f"Error processing image: {e}")
    return p

@router.post("/{pano_id}/attach", response_model=schemas.PanoramaOut)
def attach(map_id: UUID, pano_id: UUID, data: schemas.PanoramaAttachIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _own_map(map_id, user, db)
    p = db.get(Panorama, pano_id)
    n = db.get(Node, data.node_id)
    if not p or not n or p.map_id != map_id or n.map_id != map_id:
        raise HTTPException(400)
    p.yaw, p.pitch = data.yaw, data.pitch
    n.panorama_id = p.id
    db.commit(); db.refresh(p)
    return p