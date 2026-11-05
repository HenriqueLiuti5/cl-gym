"""Migrações do banco. A URL vem de DATABASE_URL (ou do .env), igual ao app.

uv run alembic upgrade head                                   # aplica no banco local
uv run alembic revision --autogenerate -m "descrição"         # gera migração nova
DATABASE_URL="postgresql://..." uv run alembic upgrade head   # aplica no Neon
"""

from logging.config import fileConfig

from alembic import context
from sqlmodel import SQLModel

import backend.models  # noqa: F401  (registra as tabelas no metadata)
from backend.config import DatabaseSettings
from backend.db import criar_engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata
URL = DatabaseSettings().sqlalchemy_url
OPCOES = {
    "target_metadata": target_metadata,
    "compare_type": True,
    # SQLite não altera colunas no lugar; o modo batch recria a tabela quando preciso.
    "render_as_batch": URL.startswith("sqlite"),
}


def run_migrations_offline() -> None:
    context.configure(url=URL, literal_binds=True, dialect_opts={"paramstyle": "named"}, **OPCOES)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = criar_engine(URL)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, **OPCOES)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
