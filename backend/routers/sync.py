from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from backend.auth import UsuarioAtual
from backend.db import SessionDep
from backend.sync import (
    Mudancas,
    Pacote,
    ReferenciaInvalida,
    RegistroAlheio,
    ResultadoEnvio,
    aplicar_mudancas,
    coletar_mudancas,
)

router = APIRouter(prefix="/api/sync", tags=["sincronização"])


@router.get("")
def baixar(
    usuario: UsuarioAtual, session: SessionDep, desde: Annotated[int, Query(ge=0)] = 0
) -> Pacote:
    """Registros do usuário e exercícios do catálogo alterados depois do cursor `desde`
    (0 = tudo). Guarde o `cursor` devolvido."""
    return coletar_mudancas(session, usuario.id, desde)


@router.post(
    "",
    responses={
        403: {"description": "Tentativa de alterar registro do catálogo ou de outra pessoa"},
        409: {"description": "Referência para registro inexistente"},
    },
)
def enviar(mudancas: Mudancas, usuario: UsuarioAtual, session: SessionDep) -> ResultadoEnvio:
    """Grava as mudanças feitas no app. Em conflito, vence o `atualizado_em` mais recente.
    O envio é atômico: se algo for recusado, nada é gravado."""
    try:
        return aplicar_mudancas(session, usuario.id, mudancas)
    except RegistroAlheio as erro:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(erro)) from erro
    except ReferenciaInvalida as erro:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(erro)) from erro
