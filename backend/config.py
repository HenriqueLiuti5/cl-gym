from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Só o banco — usado também pelas migrações, que não precisam do token."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./clgym.db"

    @property
    def sqlalchemy_url(self) -> str:
        """URL no formato do SQLAlchemy, usando o driver psycopg 3 para Postgres (Neon)."""
        url = self.database_url
        for prefixo in ("postgres://", "postgresql://"):
            if url.startswith(prefixo):
                return "postgresql+psycopg://" + url.removeprefix(prefixo)
        return url


class Settings(DatabaseSettings):
    """Configuração lida de variáveis de ambiente (ou do arquivo .env em desenvolvimento)."""

    # Token único que o app envia em `Authorization: Bearer <token>`.
    app_token: str = Field(min_length=16)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # app_token vem do ambiente
