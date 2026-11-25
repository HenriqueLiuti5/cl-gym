from typing import Annotated

from fastapi import APIRouter, Depends, status

from backend.auth import UsuarioAtual
from backend.config import Settings, get_settings
from backend.conta import apagar_conta, usuario_out
from backend.db import SessionDep
from backend.models import Perfil, UsuarioOut

router = APIRouter(prefix="/api/conta", tags=["conta"])

ConfigDep = Annotated[Settings, Depends(get_settings)]


@router.get("")
def ver_conta(usuario: UsuarioAtual, settings: ConfigDep) -> UsuarioOut:
    return usuario_out(usuario, settings)


@router.patch("")
def alterar_conta(
    perfil: Perfil, usuario: UsuarioAtual, session: SessionDep, settings: ConfigDep
) -> UsuarioOut:
    """Altera só os campos enviados (nome, altura, idade); mande `null` para apagar um."""
    for campo, valor in perfil.model_dump(exclude_unset=True).items():
        setattr(usuario, campo, valor)
    session.commit()
    session.refresh(usuario)
    return usuario_out(usuario, settings)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def apagar(usuario: UsuarioAtual, session: SessionDep) -> None:
    """Apaga de verdade a conta e todos os registros dela. Não tem volta."""
    apagar_conta(session, usuario.id)
