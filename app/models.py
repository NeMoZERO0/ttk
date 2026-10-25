import uuid
from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, Boolean, DateTime, JSON, Float, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

def new_uuid() -> uuid.UUID:
    return uuid.uuid4()

class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="organizer")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Map(Base):
    __tablename__ = "maps"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="draft")
    published_version: Mapped[int] = mapped_column(Integer, default=0)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Floor(Base):
    __tablename__ = "floors"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    map_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("maps.id", ondelete="CASCADE"), index=True)
    level: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(255))
    plan_image_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)

class Panorama(Base):
    __tablename__ = "panoramas"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    map_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("maps.id", ondelete="CASCADE"), index=True)
    floor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("floors.id"), nullable=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(16), default="ready")
    image_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    preview_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    yaw: Mapped[float] = mapped_column(Float, default=0.0)
    pitch: Mapped[float] = mapped_column(Float, default=0.0)
    hfov: Mapped[float] = mapped_column(Float, default=90.0)

class Node(Base):
    __tablename__ = "nodes"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    map_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("maps.id", ondelete="CASCADE"), index=True)
    floor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("floors.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(32), default="poi")
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    x: Mapped[float] = mapped_column(Float)  # от 0 до 1
    y: Mapped[float] = mapped_column(Float)  # от 0 до 1
    panorama_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("panoramas.id", ondelete="SET NULL"), nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

class Edge(Base):
    __tablename__ = "edges"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    map_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("maps.id", ondelete="CASCADE"), index=True)
    from_node_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))
    to_node_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))
    distance: Mapped[float] = mapped_column(Float, default=1.0)
    bidirectional: Mapped[bool] = mapped_column(Boolean, default=True)
class Room(Base):
    """Помещение на плане этажа. Координаты и размеры — доли (0..1) от габаритов здания.

    Площадь в м² = w * ширина_здания_м * h * глубина_здания_м (габариты — в Map.settings).
    У обычной комнаты есть связанная точка (Node) в её центре — по ней строятся маршруты.
    Комнаты с category="corridor" — коридоры: вдоль них автоматически строится граф навигации.
    """
    __tablename__ = "rooms"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    map_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("maps.id", ondelete="CASCADE"), index=True)
    floor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("floors.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("nodes.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(64), default="room")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    w: Mapped[float] = mapped_column(Float)
    h: Mapped[float] = mapped_column(Float)
    points: Mapped[list | dict | None] = mapped_column(JSON, nullable=True, default=None)

class PanoHotspot(Base):
    """Метка на панораме (направление yaw/pitch в градусах) с подписью и описанием."""
    __tablename__ = "pano_hotspots"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    map_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("maps.id", ondelete="CASCADE"), index=True)
    panorama_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("panoramas.id", ondelete="CASCADE"), index=True)
    yaw: Mapped[float] = mapped_column(Float, default=0.0)
    pitch: Mapped[float] = mapped_column(Float, default=0.0)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class MapEvent(Base):
    """Событие для статистики организатора: просмотр карты, точки, маршрута, панорамы."""
    __tablename__ = "map_events"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    map_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("maps.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)
    node_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
