import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Só o banco — usado também pelas migrações e pelo seed, que não precisam do login."""

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

    # ID do cliente OAuth "Aplicativo da Web" do Google Cloud (o `aud` do ID token).
    google_client_id: str = Field(min_length=1)
    # Chave que assina os tokens de sessão do app. Trocar desloga todo mundo.
    sessao_secret: str = Field(min_length=32)
    # Convites: e-mails separados por vírgula. Tirar um e-mail daqui bloqueia o acesso.
    emails_permitidos: str = ""
    sessao_dias: int = Field(default=90, ge=1, le=365)
    # Login sem Google, só para desenvolvimento local (veja `login_dev_ativo`).
    login_dev: bool = False

    @property
    def login_dev_ativo(self) -> bool:
        """Nunca funciona em produção: exige LOGIN_DEV, banco SQLite e não estar na Vercel."""
        return (
            self.login_dev
            and self.database_url.startswith("sqlite")
            and not os.environ.get("VERCEL")
        )

    @property
    def emails(self) -> frozenset[str]:
        return frozenset(
            email.strip().lower() for email in self.emails_permitidos.split(",") if email.strip()
        )

    def email_permitido(self, email: str) -> bool:
        return email.strip().lower() in self.emails


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # as chaves vêm do ambiente
