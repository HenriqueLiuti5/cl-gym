"""Login com Google e token de sessão do app.

1. O app faz o login com o Google Identity Services e recebe um *ID token* (JWT assinado pelo
   Google).
2. `POST /api/auth/google` confere o ID token (assinatura, emissor, `aud`, validade e
   `email_verified`) e se o e-mail foi convidado (`EMAILS_PERMITIDOS`). Aprovado, devolve um token
   de sessão próprio, assinado com `SESSAO_SECRET` e válido por `SESSAO_DIAS` (90 por padrão), que
   fica no aparelho e funciona mesmo depois de dias offline.
3. As outras rotas (menos `/api/health`) exigem `Authorization: Bearer <token de sessão>`. A cada
   chamada o e-mail é conferido de novo na lista: tirar o e-mail dela bloqueia o acesso na hora.
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.config import Settings, get_settings
from backend.db import SessionDep
from backend.models import Usuario

GOOGLE_EMISSORES = ("accounts.google.com", "https://accounts.google.com")
GOOGLE_CHAVES_URL = "https://www.googleapis.com/oauth2/v3/certs"
# Tolerância para relógios um pouco fora de hora.
FOLGA_RELOGIO = timedelta(seconds=30)
ALGORITMO_SESSAO = "HS256"

_bearer = HTTPBearer(auto_error=False, description="Token de sessão devolvido por /api/auth/google")


# --- ID token do Google ---------------------------------------------------------------------


class TokenGoogleInvalido(Exception):
    """O ID token não é válido (assinatura, emissor, audiência, validade ou e-mail)."""


class GoogleIndisponivel(Exception):
    """Não deu para baixar as chaves públicas do Google."""


@dataclass(frozen=True)
class IdentidadeGoogle:
    sub: str
    email: str
    nome: str | None


@lru_cache
def _chaves_google() -> jwt.PyJWKClient:
    # Guarda as chaves na memória da função; se aparecer um `kid` novo, baixa de novo.
    return jwt.PyJWKClient(GOOGLE_CHAVES_URL, cache_keys=True, lifespan=6 * 3600, timeout=10)


def _chave_publica_do_google(id_token: str) -> Any:
    return _chaves_google().get_signing_key_from_jwt(id_token).key


class VerificadorGoogle:
    """Confere ID tokens do Google. `obter_chave` existe para os testes rodarem sem rede."""

    def __init__(
        self, client_id: str, obter_chave: Callable[[str], Any] = _chave_publica_do_google
    ) -> None:
        self.client_id = client_id
        self._obter_chave = obter_chave

    def verificar(self, id_token: str) -> IdentidadeGoogle:
        try:
            chave = self._obter_chave(id_token)
        except jwt.PyJWKClientConnectionError as erro:
            raise GoogleIndisponivel(str(erro)) from erro
        except (jwt.PyJWKClientError, jwt.InvalidTokenError) as erro:
            raise TokenGoogleInvalido(str(erro)) from erro

        try:
            dados = jwt.decode(
                id_token,
                chave,
                algorithms=["RS256"],
                audience=self.client_id,
                issuer=GOOGLE_EMISSORES,
                leeway=FOLGA_RELOGIO,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            )
        except jwt.InvalidTokenError as erro:
            raise TokenGoogleInvalido(str(erro)) from erro

        if dados.get("email_verified") not in (True, "true"):
            raise TokenGoogleInvalido("e-mail não verificado pelo Google")
        email = dados.get("email")
        sub = dados["sub"]
        if not isinstance(email, str) or not email or not isinstance(sub, str) or not sub:
            raise TokenGoogleInvalido("ID token sem e-mail ou sem sub")
        nome = dados.get("name")
        return IdentidadeGoogle(
            sub=sub,
            email=email.strip().lower(),
            nome=nome if isinstance(nome, str) and nome else None,
        )


def get_verificador_google(
    settings: Annotated[Settings, Depends(get_settings)],
) -> VerificadorGoogle:
    return VerificadorGoogle(settings.google_client_id)


# --- Token de sessão do app -----------------------------------------------------------------


def criar_token_sessao(
    usuario_id: uuid.UUID, settings: Settings, agora: datetime | None = None
) -> tuple[str, datetime]:
    """Devolve o token e quando ele expira."""
    agora = agora or datetime.now(UTC)
    expira_em = agora + timedelta(days=settings.sessao_dias)
    token = jwt.encode(
        {"sub": str(usuario_id), "iat": agora, "exp": expira_em},
        settings.sessao_secret,
        algorithm=ALGORITMO_SESSAO,
    )
    return token, expira_em


def _nao_autenticado(detalhe: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detalhe,
        headers={"WWW-Authenticate": "Bearer"},
    )


def usuario_atual(
    credenciais: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
    session: SessionDep,
) -> Usuario:
    if credenciais is None:
        raise _nao_autenticado("Token de sessão ausente")
    try:
        dados = jwt.decode(
            credenciais.credentials,
            settings.sessao_secret,
            algorithms=[ALGORITMO_SESSAO],
            options={"require": ["exp", "iat", "sub"]},
        )
        usuario_id = uuid.UUID(dados["sub"])
    except (jwt.InvalidTokenError, ValueError) as erro:
        raise _nao_autenticado("Token de sessão inválido ou vencido") from erro

    usuario = session.get(Usuario, usuario_id)
    if usuario is None:  # conta apagada
        raise _nao_autenticado("Conta não encontrada")
    if not settings.email_permitido(usuario.email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso removido")
    return usuario


UsuarioAtual = Annotated[Usuario, Depends(usuario_atual)]
