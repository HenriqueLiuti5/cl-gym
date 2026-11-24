from fastapi import APIRouter, Response, status

from backend.auth import UsuarioAtual
from backend.conta import Exportacao, apagar_conta, exportar_conta
from backend.db import SessionDep
from backend.models import Metas, UsuarioOut

router = APIRouter(prefix="/api/conta", tags=["conta"])


@router.get("")
def ver_conta(usuario: UsuarioAtual) -> UsuarioOut:
    return UsuarioOut.model_validate(usuario, from_attributes=True)


@router.patch("")
def alterar_metas(metas: Metas, usuario: UsuarioAtual, session: SessionDep) -> UsuarioOut:
    """Altera só as metas enviadas; mande `null` para apagar uma."""
    for campo, valor in metas.model_dump(exclude_unset=True).items():
        setattr(usuario, campo, valor)
    session.commit()
    session.refresh(usuario)
    return UsuarioOut.model_validate(usuario, from_attributes=True)


@router.get("/exportar")
def exportar(usuario: UsuarioAtual, session: SessionDep, response: Response) -> Exportacao:
    """Tudo o que é do usuário, em JSON (inclui os exercícios do catálogo, para ter os nomes)."""
    response.headers["Content-Disposition"] = 'attachment; filename="cl-gym-exportacao.json"'
    return exportar_conta(session, usuario)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def apagar(usuario: UsuarioAtual, session: SessionDep) -> None:
    """Apaga de verdade a conta e todos os registros dela. Não tem volta."""
    apagar_conta(session, usuario.id)
