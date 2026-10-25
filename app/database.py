from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.config import settings


def _normalize_db_url(url: str) -> str:
    """Приводим любой postgres-URL к драйверу psycopg (v3).

    В .env может лежать postgresql://, postgres:// или postgresql+psycopg2:// —
    все варианты переводим на psycopg3, который есть в requirements.txt
    (psycopg2 под Python 3.15 ставится не всегда).
    """
    for prefix in ("postgresql+psycopg2://", "postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


import socket

def _is_pg_open() -> bool:
    try:
        with socket.create_connection(("localhost", 5432), timeout=0.8):
            return True
    except OSError:
        return False

db_url = _normalize_db_url(settings.database_url)
if not db_url.startswith("sqlite") and not _is_pg_open():
    db_url = "sqlite:///./app.db"

_connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
engine = create_engine(db_url, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
