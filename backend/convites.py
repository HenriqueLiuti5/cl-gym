"""Convites: o único jeito de criar conta (fora o admin, que entra sem convite).

O admin gera um convite e manda o link (`#/convite/<id>`) e o código para a pessoa. O código tem
8 letras e números de um alfabeto sem os caracteres que se confundem (0/O, 1/I/L) — o mesmo de
`frontend/src/lib/convite.ts` —, vale 24 h e serve para uma conta só. Com 31⁸ (≈ 8,5 × 10¹¹)
códigos possíveis, adivinhar um não é viável, então ele funciona sozinho (no app instalado do
iPhone a pessoa digita o código sem ter o link).
"""

import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import update
from sqlmodel import Session, col, select

from backend.models import Convite, ConviteAdmin, SituacaoConvite, Usuario, UsuarioResumo

ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
TAMANHO = 8
VALIDADE = timedelta(hours=24)
# Na lista do admin: os válidos sempre; os outros, só os criados há menos que isto.
HISTORICO = timedelta(days=30)

MENSAGENS = {
    "nao-encontrado": "Código de convite não encontrado. Confira as letras e os números.",
    "expirado": "Este convite expirou. Peça outro.",
    "usado": "Este convite já foi usado.",
    "cancelado": "Este convite foi cancelado.",
}


class ConviteInvalido(Exception):
    """O código não existe ou o convite não vale mais (expirado, usado ou cancelado)."""

    def __init__(self, situacao: str) -> None:
        self.situacao = situacao
        super().__init__(MENSAGENS[situacao])


def normalizar_codigo(texto: str) -> str:
    """O que a pessoa digitou → só letras e números, em maiúsculas ("7kqm-x4pd" → "7KQMX4PD")."""
    return re.sub(r"[^A-Z0-9]", "", texto.upper())


def formatar_codigo(codigo: str) -> str:
    return f"{codigo[:4]}-{codigo[4:]}"


def gerar_codigo() -> str:
    return "".join(secrets.choice(ALFABETO) for _ in range(TAMANHO))


def situacao(convite: Convite, agora: datetime | None = None) -> SituacaoConvite:
    agora = agora or datetime.now(UTC)
    if convite.cancelado_em is not None:
        return "cancelado"
    if convite.usado_em is not None:
        return "usado"
    if convite.expira_em <= agora:
        return "expirado"
    return "valido"


def achar_por_codigo(session: Session, texto: str) -> Convite | None:
    codigo = normalizar_codigo(texto)
    if len(codigo) != TAMANHO:
        return None
    return session.exec(select(Convite).where(Convite.codigo == codigo)).first()


def criar_convite(session: Session, agora: datetime | None = None) -> Convite:
    """Gera um convite novo, válido por 24 h, e grava."""
    agora = agora or datetime.now(UTC)
    for _ in range(10):
        codigo = gerar_codigo()
        if session.exec(select(Convite.id).where(Convite.codigo == codigo)).first() is None:
            break
    else:  # pragma: no cover  (10 colisões seguidas em 8,5 × 10¹¹ códigos)
        raise RuntimeError("não deu para gerar um código de convite livre")
    convite = Convite(codigo=codigo, criado_em=agora, expira_em=agora + VALIDADE)
    session.add(convite)
    session.commit()
    session.refresh(convite)
    return convite


def usar_convite(
    session: Session, texto: str, usuario_id: uuid.UUID, agora: datetime | None = None
) -> None:
    """Marca o convite como usado pela conta nova, sem fazer commit: vai junto com a criação da
    conta. O UPDATE só pega se o convite ainda vale; se outra pessoa usou antes (ao mesmo tempo),
    não altera nada e o convite conta como já usado."""
    agora = agora or datetime.now(UTC)
    convite = achar_por_codigo(session, texto)
    if convite is None:
        raise ConviteInvalido("nao-encontrado")
    atual = situacao(convite, agora)
    if atual != "valido":
        raise ConviteInvalido(atual)
    stmt = (
        update(Convite)
        .where(
            col(Convite.id) == convite.id,
            col(Convite.usado_em).is_(None),
            col(Convite.cancelado_em).is_(None),
            col(Convite.expira_em) > agora,
        )
        .values(usado_em=agora, usado_por=usuario_id)
    )
    if session.connection().execute(stmt).rowcount != 1:
        raise ConviteInvalido("usado")


def para_admin(convite: Convite, usado_por: Usuario | None, agora: datetime) -> ConviteAdmin:
    atual = situacao(convite, agora)
    return ConviteAdmin(
        id=convite.id,
        # O código só aparece enquanto ainda serve para alguma coisa.
        codigo=formatar_codigo(convite.codigo) if atual == "valido" else None,
        situacao=atual,
        criado_em=convite.criado_em,
        expira_em=convite.expira_em,
        usado_em=convite.usado_em,
        cancelado_em=convite.cancelado_em,
        usado_por=(
            UsuarioResumo(id=usado_por.id, nome=usado_por.nome, email=usado_por.email)
            if usado_por is not None
            else None
        ),
    )
