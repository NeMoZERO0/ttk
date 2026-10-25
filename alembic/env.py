from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

from app.config import settings
from app.database import Base
from app import models  # noqa: F401 — важно, чтобы модели зарегистрировались

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline():
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()
        # Список системных таблиц и схем PostGIS, которые нужно игнорировать
EXCLUDE_TABLES = {"spatial_ref_sys", "topology", "layer", "tiger", "tiger_data", "topology_layer"}
EXCLUDE_SCHEMAS = {"topology", "tiger", "tiger_data"}

def include_name(name, type_, parent_names):
    if type_ == "schema":
        return name not in EXCLUDE_SCHEMAS
    return True

def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table" and name in EXCLUDE_TABLES:
        return False
    return True

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_name=include_name,
            include_object=include_object
        )
        with context.begin_transaction():
            context.run_migrations()