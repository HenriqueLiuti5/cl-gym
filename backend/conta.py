"""Conta do usuário: primeiro login (com a cópia das fichas modelo) e apagar a conta."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete
from sqlmodel import Session, col, select

from backend.auth import IdentidadeGoogle
from backend.models import (
    Exercicio,
    Ficha,
    FichaExercicio,
    Meta,
    RegistroDiario,
    Serie,
    Sessao,
    Usuario,
)
from backend.sync import proxima_versao

# Namespace das cópias: a mesma ficha modelo gera sempre o mesmo id para o mesmo usuário.
NAMESPACE_COPIAS = uuid.UUID("0f6b1e1c-8f0a-4c43-9d2e-6a7b3c1d5e90")


def _id_da_copia(usuario_id: uuid.UUID, modelo_id: uuid.UUID) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE_COPIAS, f"{usuario_id}:{modelo_id}")


def copiar_fichas_modelo(session: Session, usuario_id: uuid.UUID) -> int:
    """Dá ao usuário uma cópia das fichas modelo do catálogo. Devolve quantas fichas copiou."""
    modelos = session.exec(
        select(Ficha).where(col(Ficha.usuario_id).is_(None), col(Ficha.excluido).is_(False))
    ).all()
    if not modelos:
        return 0
    versao = proxima_versao(session)
    agora = datetime.now(UTC)
    copiadas = 0
    for modelo in modelos:
        ficha_id = _id_da_copia(usuario_id, modelo.id)
        if session.get(Ficha, ficha_id) is not None:
            continue
        session.add(
            Ficha(
                id=ficha_id,
                usuario_id=usuario_id,
                atualizado_em=agora,
                versao=versao,
                nome=modelo.nome,
                ordem=modelo.ordem,
            )
        )
        session.flush()
        itens = session.exec(
            select(FichaExercicio).where(
                FichaExercicio.ficha_id == modelo.id,
                col(FichaExercicio.usuario_id).is_(None),
                col(FichaExercicio.excluido).is_(False),
            )
        ).all()
        for item in itens:
            session.add(
                FichaExercicio(
                    id=_id_da_copia(usuario_id, item.id),
                    usuario_id=usuario_id,
                    atualizado_em=agora,
                    versao=versao,
                    ficha_id=ficha_id,
                    exercicio_id=item.exercicio_id,
                    ordem=item.ordem,
                    series=item.series,
                    alvo_reps=item.alvo_reps,
                    aquecimento=item.aquecimento,
                    grupo_biset=item.grupo_biset,
                    alternativas=list(item.alternativas),
                    observacao=item.observacao,
                )
            )
        copiadas += 1
    session.flush()
    return copiadas


def entrar(session: Session, identidade: IdentidadeGoogle) -> tuple[Usuario, bool]:
    """Acha o usuário pelo `sub` do Google ou cria um novo. Devolve (usuário, se é novo)."""
    usuario = session.exec(select(Usuario).where(Usuario.google_sub == identidade.sub)).first()
    novo = usuario is None
    if usuario is None:
        usuario = Usuario(
            google_sub=identidade.sub,
            email=identidade.email,
            nome=identidade.nome,
            criado_em=datetime.now(UTC),
        )
        session.add(usuario)
        session.flush()
        copiar_fichas_modelo(session, usuario.id)
    else:
        # O e-mail pode mudar na conta Google. O nome do Google só entra se a pessoa não tiver
        # um: depois do primeiro acesso, o nome é o que ela escolheu no app.
        usuario.email = identidade.email
        if not usuario.nome:
            usuario.nome = identidade.nome
    session.commit()
    session.refresh(usuario)
    return usuario, novo


def apagar_conta(session: Session, usuario_id: uuid.UUID) -> None:
    """Apaga de verdade tudo do usuário (única exceção à exclusão lógica)."""
    # Filhos antes dos pais, por causa das chaves estrangeiras.
    for modelo in (Serie, Sessao, RegistroDiario, Meta, FichaExercicio, Ficha, Exercicio):
        session.exec(delete(modelo).where(col(modelo.usuario_id) == usuario_id))
    session.exec(delete(Usuario).where(col(Usuario.id) == usuario_id))
    session.commit()
