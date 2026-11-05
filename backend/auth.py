import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.config import Settings, get_settings

_bearer = HTTPBearer(auto_error=False, description="Token definido em APP_TOKEN")


def exigir_token(
    credenciais: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """App de um usuário só: basta comparar com o token configurado no servidor."""
    if credenciais is None or not secrets.compare_digest(
        credenciais.credentials.encode(), settings.app_token.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou ausente",
            headers={"WWW-Authenticate": "Bearer"},
        )
