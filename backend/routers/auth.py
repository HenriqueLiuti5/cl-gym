from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from backend.atividade import registrar_atividade
from backend.auth import (
    GoogleIndisponivel,
    IdentidadeGoogle,
    TokenGoogleInvalido,
    VerificadorGoogle,
    criar_token_sessao,
    get_verificador_google,
)
from backend.config import Settings, get_settings
from backend.conta import AcessoNegado, entrar_com_regras, usuario_out
from backend.db import SessionDep
from backend.models import UsuarioOut

router = APIRouter(prefix="/api/auth", tags=["login"])


class Config(BaseModel):
    google_client_id: str
    login_dev: bool


class LoginGoogle(BaseModel):
    # O `credential` que o Google Identity Services entrega ao app.
    id_token: str = Field(min_length=1, max_length=8192)
    # Código do convite: só para criar a conta (quem já tem conta não precisa).
    convite: str | None = Field(default=None, max_length=20)


class LoginDev(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    nome: str | None = Field(default=None, max_length=200)
    convite: str | None = Field(default=None, max_length=20)


class Login(BaseModel):
    token: str
    expira_em: datetime
    usuario: UsuarioOut
    # Primeiro login: a conta acabou de ser criada, ainda sem fichas.
    novo: bool


@router.get("/config")
def config(settings: Annotated[Settings, Depends(get_settings)]) -> Config:
    """O que o app precisa para mostrar o botão do Google (o client id é público)."""
    return Config(google_client_id=settings.google_client_id, login_dev=settings.login_dev_ativo)


def _sessao(
    session: SessionDep,
    settings: Settings,
    identidade: IdentidadeGoogle,
    convite: str | None,
    request: Request,
) -> Login:
    try:
        usuario, novo = entrar_com_regras(session, settings, identidade, convite)
    except AcessoNegado as erro:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(erro),
            headers={"X-Motivo": erro.motivo},
        ) from erro
    registrar_atividade(
        session,
        usuario,
        request.headers.get("user-agent"),
        request.headers.get("x-app-instalado"),
        forcar=True,
    )
    token, expira_em = criar_token_sessao(usuario.id, settings)
    return Login(
        token=token, expira_em=expira_em, usuario=usuario_out(usuario, settings), novo=novo
    )


RESPOSTAS_LOGIN: dict[int | str, dict[str, str]] = {
    401: {"description": "ID token do Google inválido"},
    403: {
        "description": "Sem convite, convite inválido ou acesso bloqueado (motivo no cabeçalho "
        "X-Motivo: sem-convite, convite-invalido ou bloqueado)"
    },
    503: {"description": "Não deu para falar com o Google"},
}


@router.post("/google", responses=RESPOSTAS_LOGIN)
def login_google(
    corpo: LoginGoogle,
    request: Request,
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

    return _sessao(session, settings, identidade, corpo.convite, request)


@router.post("/dev", include_in_schema=False)
def login_dev(
    corpo: LoginDev,
    request: Request,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Login:
    """Login sem Google para testar localmente (com as mesmas regras de convite). Em produção
    responde 404."""
    if not settings.login_dev_ativo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    email = corpo.email.strip().lower()
    identidade = IdentidadeGoogle(f"dev:{email}", email, corpo.nome)
    return _sessao(session, settings, identidade, corpo.convite, request)
