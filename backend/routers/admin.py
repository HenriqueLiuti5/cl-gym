"""Área de administração: só para a conta do `ADMIN_EMAIL`. Lista as pessoas (só atividade:
nada de peso, alimentação, metas ou cargas), bloqueia, desbloqueia e apaga contas, e gera os
convites."""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, col, select

from backend.auth import UsuarioAtual
from backend.config import Settings, get_settings
from backend.conta import apagar_conta
from backend.convites import HISTORICO, criar_convite, para_admin, situacao
from backend.db import SessionDep
from backend.models import Convite, ConviteAdmin, Sessao, Usuario, UsuarioAdmin

ConfigDep = Annotated[Settings, Depends(get_settings)]


def usuario_admin(usuario: UsuarioAtual, settings: ConfigDep) -> Usuario:
    if not settings.e_admin(usuario.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Só o administrador pode fazer isto."
        )
    return usuario


AdminAtual = Annotated[Usuario, Depends(usuario_admin)]

router = APIRouter(
    prefix="/api/admin",
    tags=["administração"],
    dependencies=[Depends(usuario_admin)],
    responses={403: {"description": "Não é o administrador"}},
)

JANELA_RECENTE = timedelta(days=30)


def _contagens(
    session: Session, ids: Sequence[uuid.UUID], agora: datetime
) -> dict[uuid.UUID, tuple[int, int, datetime | None]]:
    """(treinos terminados, terminados nos últimos 30 dias, último treino) de cada pessoa."""
    terminados = [
        col(Sessao.usuario_id).in_(ids),
        col(Sessao.excluido).is_(False),
        col(Sessao.finalizada_em).is_not(None),
    ]
    totais = session.exec(
        select(Sessao.usuario_id, func.count(), func.max(Sessao.finalizada_em))
        .where(*terminados)
        .group_by(col(Sessao.usuario_id))
    ).all()
    recentes = dict(
        session.exec(
            select(Sessao.usuario_id, func.count())
            .where(*terminados, col(Sessao.finalizada_em) >= agora - JANELA_RECENTE)
            .group_by(col(Sessao.usuario_id))
        ).all()
    )
    return {
        usuario_id: (total, recentes.get(usuario_id, 0), ultimo)
        for usuario_id, total, ultimo in totais
    }


def _para_admin(
    usuario: Usuario, contagem: tuple[int, int, datetime | None] | None, settings: Settings
) -> UsuarioAdmin:
    treinos, treinos_30d, ultimo = contagem or (0, 0, None)
    return UsuarioAdmin(
        id=usuario.id,
        nome=usuario.nome,
        email=usuario.email,
        criado_em=usuario.criado_em,
        visto_em=usuario.visto_em,
        aparelho=usuario.aparelho,
        instalado=usuario.instalado,
        bloqueado=usuario.bloqueado_em is not None,
        bloqueado_em=usuario.bloqueado_em,
        admin=settings.e_admin(usuario.email),
        treinos=treinos,
        treinos_30d=treinos_30d,
        ultimo_treino=ultimo,
    )


def _um(session: Session, usuario: Usuario, settings: Settings) -> UsuarioAdmin:
    contagens = _contagens(session, [usuario.id], datetime.now(UTC))
    return _para_admin(usuario, contagens.get(usuario.id), settings)


def _alvo(session: Session, usuario_id: uuid.UUID) -> Usuario:
    usuario = session.get(Usuario, usuario_id)
    if usuario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")
    return usuario


def _nao_e_o_admin(alvo: Usuario, admin: Usuario, settings: Settings, mensagem: str) -> None:
    if alvo.id == admin.id or settings.e_admin(alvo.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=mensagem)


# --- Usuários -------------------------------------------------------------------------------


@router.get("/usuarios")
def listar_usuarios(session: SessionDep, settings: ConfigDep) -> list[UsuarioAdmin]:
    """Todas as pessoas, as vistas mais recentemente primeiro (quem nunca foi visto, no fim)."""
    usuarios = session.exec(select(Usuario)).all()
    contagens = _contagens(session, [u.id for u in usuarios], datetime.now(UTC))
    ordenados = sorted(
        usuarios,
        key=lambda u: (u.visto_em is None, -u.visto_em.timestamp() if u.visto_em else 0),
    )
    return [_para_admin(u, contagens.get(u.id), settings) for u in ordenados]


@router.post("/usuarios/{usuario_id}/bloquear")
def bloquear(
    usuario_id: uuid.UUID, admin: AdminAtual, session: SessionDep, settings: ConfigDep
) -> UsuarioAdmin:
    """A pessoa perde o acesso na próxima chamada (o app sai da conta); os dados ficam."""
    alvo = _alvo(session, usuario_id)
    _nao_e_o_admin(alvo, admin, settings, "Você não pode bloquear a própria conta.")
    if alvo.bloqueado_em is None:
        alvo.bloqueado_em = datetime.now(UTC)
        session.commit()
        session.refresh(alvo)
    return _um(session, alvo, settings)


@router.post("/usuarios/{usuario_id}/desbloquear")
def desbloquear(usuario_id: uuid.UUID, session: SessionDep, settings: ConfigDep) -> UsuarioAdmin:
    alvo = _alvo(session, usuario_id)
    if alvo.bloqueado_em is not None:
        alvo.bloqueado_em = None
        session.commit()
        session.refresh(alvo)
    return _um(session, alvo, settings)


@router.delete("/usuarios/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def apagar_usuario(
    usuario_id: uuid.UUID, admin: AdminAtual, session: SessionDep, settings: ConfigDep
) -> None:
    """Apaga de verdade a conta e tudo dela. Não tem volta."""
    alvo = _alvo(session, usuario_id)
    _nao_e_o_admin(alvo, admin, settings, "Para apagar a sua conta, use Apagar minha conta.")
    apagar_conta(session, alvo.id)


# --- Convites -------------------------------------------------------------------------------


def _convites_para_admin(session: Session, convites: Sequence[Convite]) -> list[ConviteAdmin]:
    ids = {c.usado_por for c in convites if c.usado_por is not None}
    pessoas = (
        {u.id: u for u in session.exec(select(Usuario).where(col(Usuario.id).in_(ids))).all()}
        if ids
        else {}
    )
    agora = datetime.now(UTC)
    return [
        para_admin(c, pessoas.get(c.usado_por) if c.usado_por else None, agora) for c in convites
    ]


@router.get("/convites")
def listar_convites(session: SessionDep) -> list[ConviteAdmin]:
    """Os que ainda valem e os outros dos últimos 30 dias, os mais novos primeiro."""
    agora = datetime.now(UTC)
    convites = session.exec(select(Convite).order_by(col(Convite.criado_em).desc())).all()
    mostrados = [
        c for c in convites if situacao(c, agora) == "valido" or c.criado_em >= agora - HISTORICO
    ]
    return _convites_para_admin(session, mostrados)


@router.post("/convites", status_code=status.HTTP_201_CREATED)
def gerar_convite(session: SessionDep) -> ConviteAdmin:
    """Convite novo, válido por 24 h, para uma pessoa."""
    return _convites_para_admin(session, [criar_convite(session)])[0]


@router.post("/convites/{convite_id}/cancelar")
def cancelar_convite(convite_id: uuid.UUID, session: SessionDep) -> ConviteAdmin:
    convite = session.get(Convite, convite_id)
    if convite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Convite não encontrado.")
    if situacao(convite) != "valido":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Só dá para cancelar um convite que ainda vale.",
        )
    convite.cancelado_em = datetime.now(UTC)
    session.commit()
    session.refresh(convite)
    return _convites_para_admin(session, [convite])[0]
