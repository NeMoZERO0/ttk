from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    redis_url: str
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    s3_bucket: str
    jwt_secret: str
    jwt_alg: str = "HS256"
    jwt_expire_minutes: int = 1440
    # При старте создать таблицы (alembic-миграция пока пустая)
    auto_create_tables: bool = True
    # При старте создать демо-карту (slug "demo"), если её ещё нет
    seed_demo: bool = True

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

settings = Settings()
