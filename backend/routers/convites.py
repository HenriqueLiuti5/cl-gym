"""Rotas públicas do convite (sem token): a tela do link mostra se o convite ainda vale, e o app
confere o código antes de mandar a pessoa para o Google. Nenhuma das duas gasta o convite nem
devolve o código."""

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from backend.convites import MENSAGENS, achar_por_codigo, situacao
from backend.db import SessionDep
from backend.models import Convite, ConvitePublico

router = APIRouter(prefix="/api/convites", tags=["convites"])


class Verificacao(BaseModel):
    codigo: str = Field(min_length=1, max_length=20)


def _publico(convite: Convite) -> ConvitePublico:
    return ConvitePublico(situacao=situacao(convite), expira_em=convite.expira_em)


@router.post("/verificar", responses={404: {"description": "Código não encontrado"}})
def verificar(corpo: Verificacao, session: SessionDep) -> ConvitePublico:
    """Situação do convite deste código. Só siga para o Google se for `valido`."""
    convite = achar_por_codigo(session, corpo.codigo)
    if convite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=MENSAGENS["nao-encontrado"]
        )
    return _publico(convite)


@router.get("/{convite_id}", responses={404: {"description": "Convite não encontrado"}})
def ver(convite_id: uuid.UUID, session: SessionDep) -> ConvitePublico:
    """Situação do convite do link (`#/convite/<id>`)."""
    convite = session.get(Convite, convite_id)
    if convite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Convite não encontrado.")
    return _publico(convite)
