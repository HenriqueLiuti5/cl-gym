"""Fichas modelo do catálogo, para o "Usar um modelo pronto" do app.

A conta nova começa sem fichas. Quando a pessoa escolhe um modelo, o app o copia localmente (com
ids novos) e envia a cópia pela sincronização normal, como uma ficha criada por ela: por isso
esta rota só lê.
"""

import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlmodel import col, select

from backend.auth import usuario_atual
from backend.db import SessionDep
from backend.models import Ficha, FichaExercicio, FichaModeloOut, ItemModeloOut

router = APIRouter(
    prefix="/api/modelos", tags=["fichas modelo"], dependencies=[Depends(usuario_atual)]
)


@router.get("")
def listar_modelos(session: SessionDep) -> list[FichaModeloOut]:
    """As fichas modelo (sem as excluídas) em `ordem`, cada uma com os exercícios em `ordem`."""
    fichas = session.exec(
        select(Ficha)
        .where(col(Ficha.usuario_id).is_(None), col(Ficha.excluido).is_(False))
        .order_by(col(Ficha.ordem), col(Ficha.id))
    ).all()
    if not fichas:
        return []
    itens: dict[uuid.UUID, list[ItemModeloOut]] = defaultdict(list)
    for item in session.exec(
        select(FichaExercicio)
        .where(
            col(FichaExercicio.ficha_id).in_([f.id for f in fichas]),
            col(FichaExercicio.usuario_id).is_(None),
            col(FichaExercicio.excluido).is_(False),
        )
        .order_by(col(FichaExercicio.ordem), col(FichaExercicio.id))
    ).all():
        itens[item.ficha_id].append(ItemModeloOut.model_validate(item, from_attributes=True))
    return [
        FichaModeloOut(id=f.id, nome=f.nome, ordem=f.ordem, exercicios=itens[f.id]) for f in fichas
    ]
