"""Conta do usuário: quem pode entrar (convite, admin, bloqueio), criar a conta e apagá-la.

A conta nova começa sem fichas (desde 26/11/2026): o app oferece "Criar treino" e "Usar um modelo
pronto" (`GET /api/modelos`). As contas criadas antes ficam com a cópia que receberam."""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import delete, update
from sqlmodel import Session, col, select

from backend.auth import MENSAGEM_BLOQUEADO, IdentidadeGoogle, esta_bloqueado
from backend.config import Settings
from backend.convites import ConviteInvalido, usar_convite
from backend.models import (
    Convite,
    Exercicio,
    Ficha,
    FichaExercicio,
    Meta,
    RegistroDiario,
    Serie,
    Sessao,
    Usuario,
    UsuarioOut,
)
from backend.sync import proxima_versao

SEM_CONVITE = "Para criar sua conta, você precisa de um convite."


class AcessoNegado(Exception):
    """Login recusado. O `motivo` vai no cabeçalho X-Motivo; a mensagem é para a pessoa."""

    def __init__(self, motivo: str, mensagem: str) -> None:
        self.motivo = motivo
        super().__init__(mensagem)


# Namespace das cópias: a mesma ficha modelo gera sempre o mesmo id para o mesmo usuário.
NAMESPACE_COPIAS = uuid.UUID("0f6b1e1c-8f0a-4c43-9d2e-6a7b3c1d5e90")


def _id_da_copia(usuario_id: uuid.UUID, modelo_id: uuid.UUID) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE_COPIAS, f"{usuario_id}:{modelo_id}")


def copiar_fichas_modelo(session: Session, usuario_id: uuid.UUID) -> int:
    """Dá ao usuário uma cópia das fichas modelo do catálogo. Devolve quantas fichas copiou.

    O login não chama mais (a conta nova começa sem fichas e o app copia o modelo que a pessoa
    escolher); fica para as contas de dados inventados (`backend.dados_dev`)."""
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
                    alternativas=list(item.alternativas),
                    observacao=item.observacao,
                )
            )
        copiadas += 1
    session.flush()
    return copiadas


def entrar(
    session: Session,
    identidade: IdentidadeGoogle,
    antes_de_criar: Callable[[Usuario], None] | None = None,
) -> tuple[Usuario, bool]:
    """Acha o usuário pelo `sub` do Google ou cria um novo, sem fichas. Devolve (usuário, se é
    novo).

    `antes_de_criar` roda na mesma transação da conta nova (ex.: usar o convite); se ela falhar,
    quem chamou desfaz tudo e nada é gravado."""
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
        if antes_de_criar is not None:
            antes_de_criar(usuario)
    else:
        # O e-mail pode mudar na conta Google. O nome do Google só entra se a pessoa não tiver
        # um: depois do primeiro acesso, o nome é o que ela escolheu no app.
        usuario.email = identidade.email
        if not usuario.nome:
            usuario.nome = identidade.nome
    session.commit()
    session.refresh(usuario)
    return usuario, novo


def entrar_com_regras(
    session: Session, settings: Settings, identidade: IdentidadeGoogle, convite: str | None
) -> tuple[Usuario, bool]:
    """Quem pode entrar: quem já tem conta (se não estiver bloqueado), o admin (cria a conta sem
    convite) e quem traz um convite válido (que é gasto junto com a criação da conta)."""
    existente = session.exec(select(Usuario).where(Usuario.google_sub == identidade.sub)).first()
    if existente is not None:
        if esta_bloqueado(existente, settings):
            raise AcessoNegado("bloqueado", MENSAGEM_BLOQUEADO)
        # Já tem conta: um convite que tenha vindo junto fica para outra pessoa.
        return entrar(session, identidade)
    if settings.e_admin(identidade.email):
        return entrar(session, identidade)
    if not convite or not convite.strip():
        raise AcessoNegado("sem-convite", SEM_CONVITE)
    try:
        return entrar(
            session, identidade, antes_de_criar=lambda u: usar_convite(session, convite, u.id)
        )
    except ConviteInvalido as erro:
        session.rollback()
        raise AcessoNegado("convite-invalido", str(erro)) from erro


def usuario_out(usuario: Usuario, settings: Settings) -> UsuarioOut:
    saida = UsuarioOut.model_validate(usuario, from_attributes=True)
    saida.admin = settings.e_admin(usuario.email)
    return saida


def apagar_conta(session: Session, usuario_id: uuid.UUID) -> None:
    """Apaga de verdade tudo do usuário (única exceção à exclusão lógica)."""
    # Filhos antes dos pais, por causa das chaves estrangeiras.
    for modelo in (Serie, Sessao, RegistroDiario, Meta, FichaExercicio, Ficha, Exercicio):
        session.exec(delete(modelo).where(col(modelo.usuario_id) == usuario_id))
    # O convite usado fica no histórico do admin, sem apontar para a conta que não existe mais.
    session.exec(update(Convite).where(col(Convite.usado_por) == usuario_id).values(usado_por=None))
    session.exec(delete(Usuario).where(col(Usuario.id) == usuario_id))
    session.commit()
