from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app import models  # noqa: F401 — регистрируем модели в Base.metadata
from app.storage import ensure_bucket
from app.routers import auth, maps, floors, nodes, edges, panoramas, public, rooms, media


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 1. Таблицы. Alembic-миграция в репозитории пока пустая, поэтому
    #    создаём недостающие таблицы напрямую (существующие не трогаются).
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)
        if not str(engine.url).startswith("sqlite"):
            try:
                with engine.begin() as conn:
                    conn.exec_driver_sql("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS points JSON;")
            except Exception as e:
                print(f"Notice: points column check: {e}")

    # 2. Демо-данные для экрана посетителя.
    if settings.seed_demo:
        try:
            from app.seed import seed_demo
            seed_demo()
        except Exception as e:
            print(f"Warning: demo seed failed: {e}")

    # 3. S3 / MinIO — не критично для просмотра карты.
    try:
        ensure_bucket()
    except Exception as e:
        print(f"Warning: Could not connect to S3: {e}")
    yield


app = FastAPI(title="Space Map API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(maps.router)
app.include_router(floors.router)
app.include_router(nodes.router)
app.include_router(edges.router)
app.include_router(panoramas.router)
app.include_router(public.router)
app.include_router(rooms.router)
app.include_router(media.router)


@app.get("/health")
def health():
    return {"status": "ok"}
