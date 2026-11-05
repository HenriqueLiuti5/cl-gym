from collections.abc import Iterator
from datetime import UTC, datetime
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import DateTime, event
from sqlalchemy.engine import Dialect, Engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator
from sqlmodel import Session, create_engine

from backend.config import get_settings


class UTCDateTime(TypeDecorator[datetime]):
    """Grava datetimes em UTC (coluna sem fuso) e devolve sempre com fuso UTC.

    Garante o mesmo comportamento no SQLite (desenvolvimento/testes) e no Postgres (produção).
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("datetime sem fuso horário não é permitido")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC)


def criar_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        kwargs: dict[str, Any] = {"connect_args": {"check_same_thread": False}}
        if url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool  # mesmo banco em memória para todas as conexões
        engine = create_engine(url, **kwargs)

        @event.listens_for(engine, "connect")
        def _ativar_chaves_estrangeiras(conexao: Any, _registro: Any) -> None:
            cursor = conexao.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")  # o Postgres já valida por padrão
            cursor.close()

        return engine
    # Funções serverless reaproveitam a instância por um tempo; pre_ping descarta conexões mortas.
    return create_engine(url, pool_pre_ping=True, pool_recycle=300)


@lru_cache
def get_engine() -> Engine:
    return criar_engine(get_settings().sqlalchemy_url)


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
