from pydantic import BaseModel, EmailStr, Field, ConfigDict
from uuid import UUID
from datetime import datetime

# --- AUTH ---
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    role: str
    created_at: datetime

# --- MAPS & FLOORS ---
class MapCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    address: str | None = None

class MapOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    slug: str
    status: str
    published_version: int
    created_at: datetime
    settings: dict | None = None
    address: str | None = None

class FloorCreateIn(BaseModel):
    name: str
    level: int = 0

class FloorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    map_id: UUID
    name: str
    level: int
    plan_image_key: str | None
    width: int | None
    height: int | None

class PlanUploadIn(BaseModel):
    content_type: str

class PlanUploadOut(BaseModel):
    upload_url: str
    key: str

# --- NODES & EDGES ---
class NodeIn(BaseModel):
    floor_id: UUID
    type: str = "poi"
    name: str
    description: str | None = None
    category: str | None = None
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    panorama_id: UUID | None = None
    meta: dict = Field(default_factory=dict)

class NodeOut(NodeIn):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    map_id: UUID

class EdgeIn(BaseModel):
    from_node_id: UUID
    to_node_id: UUID
    distance: float = 1.0
    bidirectional: bool = True

class EdgeOut(EdgeIn):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    map_id: UUID

# --- PANORAMAS ---
class PanoramaCreateIn(BaseModel):
    floor_id: UUID | None = None
    content_type: str = "image/jpeg"

class PanoramaUploadOut(BaseModel):
    panorama_id: UUID
    upload_url: str
    key: str

class PanoramaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    status: str
    yaw: float
    pitch: float
    hfov: float

class PanoramaAttachIn(BaseModel):
    node_id: UUID
    yaw: float = 0.0
    pitch: float = 0.0

# --- PUBLIC ---
class RouteIn(BaseModel):
    from_node_id: UUID
    to_node_id: UUID
# --- ROOMS (редактор плана) ---
class BuildingIn(BaseModel):
    width_m: float = Field(gt=1, le=2000)
    height_m: float = Field(gt=1, le=2000)

class BuildingOut(BuildingIn):
    pass

class RoomIn(BaseModel):
    floor_id: UUID
    name: str = Field(min_length=1, max_length=255)
    category: str = "room"
    description: str | None = None
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)
    points: list[dict] | None = None

class RoomPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = None
    description: str | None = None
    x: float | None = Field(default=None, ge=0, le=1)
    y: float | None = Field(default=None, ge=0, le=1)
    w: float | None = Field(default=None, gt=0, le=1)
    h: float | None = Field(default=None, gt=0, le=1)
    points: list[dict] | None = None

class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    map_id: UUID
    floor_id: UUID
    node_id: UUID | None
    name: str
    category: str
    description: str | None
    x: float
    y: float
    w: float
    h: float
    points: list[dict] | None = None
    area_m2: float = 0

# --- PANORAMAS (редактор) ---
class PanoPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    floor_id: UUID | None = None
    x: float | None = Field(default=None, ge=0, le=1)
    y: float | None = Field(default=None, ge=0, le=1)
    yaw: float | None = Field(default=None, ge=-720, le=720)  # направление «вверх по плану», градусы

class HotspotIn(BaseModel):
    yaw: float = Field(ge=-720, le=720)
    pitch: float = Field(ge=-90, le=90)
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None

class HotspotPatch(BaseModel):
    yaw: float | None = Field(default=None, ge=-720, le=720)
    pitch: float | None = Field(default=None, ge=-90, le=90)
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None

# --- STATS ---
class EventIn(BaseModel):
    kind: str = Field(pattern="^(view|poi|route|pano)$")
    node_id: UUID | None = None
