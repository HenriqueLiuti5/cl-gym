from fastapi import APIRouter, status

from backend.auth import UsuarioAtual
from backend.conta import apagar_conta
from backend.db import SessionDep
from backend.models import Perfil, UsuarioOut

router = APIRouter(prefix="/api/conta", tags=["conta"])


@router.get("")
def ver_conta(usuario: UsuarioAtual) -> UsuarioOut:
    return UsuarioOut.model_validate(usuario, from_attributes=True)


@router.patch("")
def alterar_conta(perfil: Perfil, usuario: UsuarioAtual, session: SessionDep) -> UsuarioOut:
    """Altera só os campos enviados (nome, altura, idade, metas); mande `null` para apagar um."""
    for campo, valor in perfil.model_dump(exclude_unset=True).items():
        setattr(usuario, campo, valor)
    session.commit()
    session.refresh(usuario)
    return UsuarioOut.model_validate(usuario, from_attributes=True)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def apagar(usuario: UsuarioAtual, session: SessionDep) -> None:
    """Apaga de verdade a conta e todos os registros dela. Não tem volta."""
    apagar_conta(session, usuario.id)
