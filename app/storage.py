"""Хранилище файлов (планы, панорамы).

Основное — S3/MinIO. Если MinIO недоступен, файлы пишутся в локальную папку MEDIA_DIR
(по умолчанию ./media), чтобы сервис продолжал работать. Отдаются файлы через API:
GET /files/{key} (см. app/routers/media.py) — так нет проблем с CORS и доступом с телефона.
"""
import os
import time
from pathlib import Path

import boto3
from botocore.client import Config
from app.config import settings

s3 = boto3.client(
    "s3",
    endpoint_url=settings.s3_endpoint,
    aws_access_key_id=settings.s3_access_key,
    aws_secret_access_key=settings.s3_secret_key,
    # Короткие таймауты: если MinIO не запущен, не висим по 30 секунд
    config=Config(signature_version="s3v4", connect_timeout=2, read_timeout=10,
                  retries={"max_attempts": 1}),
    region_name="us-east-1",
)

MEDIA_DIR = Path(os.environ.get("MEDIA_DIR", "media"))
_s3_down_until = 0.0  # после ошибки S3 какое-то время сразу идём в локальную папку


def _s3_available() -> bool:
    return time.monotonic() >= _s3_down_until


def _mark_s3_down():
    global _s3_down_until
    _s3_down_until = time.monotonic() + 60


def ensure_bucket():
    try:
        s3.head_bucket(Bucket=settings.s3_bucket)
    except Exception:
        s3.create_bucket(Bucket=settings.s3_bucket)


def presign_put(key: str, content_type: str, expires: int = 900) -> str:
    return s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.s3_bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=expires,
    )


def presign_get(key: str, expires: int = 3600) -> str:
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires,
    )


def upload_fileobj(fileobj, key: str, content_type: str):
    s3.upload_fileobj(fileobj, settings.s3_bucket, key, ExtraArgs={"ContentType": content_type})


def _local_path(key: str) -> Path:
    p = (MEDIA_DIR / key).resolve()
    if not str(p).startswith(str(MEDIA_DIR.resolve())):
        raise ValueError("bad key")
    return p


def put_bytes(key: str, data: bytes, content_type: str) -> str:
    """Сохраняет файл. Возвращает, куда сохранили: 's3' или 'local'."""
    if _s3_available():
        try:
            s3.put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type)
            return "s3"
        except Exception as e:
            print(f"Warning: S3 put failed, saving locally: {e}")
            _mark_s3_down()
    p = _local_path(key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return "local"


def get_bytes(key: str) -> tuple[bytes, str] | None:
    """Читает файл: сначала локальная копия, потом S3. None — если нет нигде."""
    p = _local_path(key)
    if p.exists():
        ctype = "image/png" if key.endswith(".png") else "image/jpeg"
        return p.read_bytes(), ctype
    if _s3_available():
        try:
            obj = s3.get_object(Bucket=settings.s3_bucket, Key=key)
            return obj["Body"].read(), obj.get("ContentType") or "application/octet-stream"
        except Exception as e:
            if "NoSuchKey" not in str(e):
                _mark_s3_down()
    return None


def delete_key(key: str | None) -> None:
    if not key:
        return
    try:
        p = _local_path(key)
        if p.exists():
            p.unlink()
    except Exception:
        pass
    if _s3_available():
        try:
            s3.delete_object(Bucket=settings.s3_bucket, Key=key)
        except Exception:
            pass


def file_url(key: str | None) -> str | None:
    """Публичный адрес файла (относительно API)."""
    return f"/files/{key}" if key else None
