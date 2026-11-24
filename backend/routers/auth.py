from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.auth import (
    GoogleIndisponivel,
    IdentidadeGoogle,
    TokenGoogleInvalido,
    VerificadorGoogle,
    criar_token_sessao,
    get_verificador_google,
)
from backend.config import Settings, get_settings
from backend.conta import entrar
from backend.db import SessionDep
from backend.models import UsuarioOut

router = APIRouter(prefix="/api/auth", tags=["login"])


class Config(BaseModel):
    google_client_id: str
    login_dev: bool


class LoginGoogle(BaseModel):
    # O `credential` que o Google Identity Services entrega ao app.
    id_token: str = Field(min_length=1, max_length=8192)


class LoginDev(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    nome: str | None = Field(default=None, max_length=200)


class Login(BaseModel):
    token: str
    expira_em: datetime
    usuario: UsuarioOut
    # Primeiro login: a conta acabou de ser criada, com as fichas modelo.
    novo: bool


@router.get("/config")
def config(settings: Annotated[Settings, Depends(get_settings)]) -> Config:
    """O que o app precisa para mostrar o botão do Google (o client id é público)."""
    return Config(google_client_id=settings.google_client_id, login_dev=settings.login_dev_ativo)


def _sessao(session: SessionDep, settings: Settings, identidade: IdentidadeGoogle) -> Login:
    if not settings.email_permitido(identidade.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este e-mail não foi convidado. Peça o convite ao Henrique.",
        )
    usuario, novo = entrar(session, identidade)
    token, expira_em = criar_token_sessao(usuario.id, settings)
    return Login(
        token=token,
        expira_em=expira_em,
        usuario=UsuarioOut.model_validate(usuario, from_attributes=True),
        novo=novo,
    )


@router.post(
    "/google",
    responses={
        401: {"description": "ID token do Google inválido"},
        403: {"description": "E-mail não convidado"},
        503: {"description": "Não deu para falar com o Google"},
    },
)
def login_google(
    corpo: LoginGoogle,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
    verificador: Annotated[VerificadorGoogle, Depends(get_verificador_google)],
) -> Login:
    """Troca o ID token do Google por um token de sessão do app (válido por ~90 dias)."""
    try:
        identidade = verificador.verificar(corpo.id_token)
    except TokenGoogleInvalido as erro:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Login do Google inválido"
        ) from erro
    except GoogleIndisponivel as erro:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não deu para falar com o Google. Tente de novo.",
        ) from erro

    return _sessao(session, settings, identidade)


@router.post("/dev", include_in_schema=False)
def login_dev(
    corpo: LoginDev,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Login:
    """Login sem Google para testar localmente. Em produção responde 404."""
    if not settings.login_dev_ativo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    email = corpo.email.strip().lower()
    return _sessao(session, settings, IdentidadeGoogle(f"dev:{email}", email, corpo.nome))
