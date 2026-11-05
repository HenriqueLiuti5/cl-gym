from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.auth import exigir_token
from backend.db import SessionDep
from backend.sync import (
    Mudancas,
    Pacote,
    ReferenciaInvalida,
    ResultadoEnvio,
    aplicar_mudancas,
    coletar_mudancas,
)

router = APIRouter(prefix="/api/sync", tags=["sincronização"], dependencies=[Depends(exigir_token)])


@router.get("")
def baixar(session: SessionDep, desde: Annotated[int, Query(ge=0)] = 0) -> Pacote:
    """Registros alterados depois do cursor `desde` (0 = tudo). Guarde o `cursor` devolvido."""
    return coletar_mudancas(session, desde)


@router.post("", responses={409: {"description": "Referência para registro inexistente"}})
def enviar(mudancas: Mudancas, session: SessionDep) -> ResultadoEnvio:
    """Grava as mudanças feitas no app. Em conflito, vence o `atualizado_em` mais recente."""
    try:
        return aplicar_mudancas(session, mudancas)
    except ReferenciaInvalida as erro:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(erro)) from erro
