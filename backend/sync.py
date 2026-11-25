"""Sincronização offline-first entre o app e o servidor, separada por usuário.

O app grava tudo localmente e, quando há conexão:
1. envia o que mudou (`POST /api/sync`);
2. baixa o que mudou desde o último cursor (`GET /api/sync?desde=<cursor>`) e guarda o novo cursor.

Cada envio aplicado recebe um número novo do contador global (`versao`). O download devolve os
registros com `desde < versao <= cursor`, lendo o cursor antes dos registros: assim um envio que
ainda não terminou nunca é pulado — ele simplesmente vem no próximo download.

Isolamento: o servidor grava o `usuario_id` do token em tudo o que recebe; o download só traz os
registros do usuário e os exercícios do catálogo; o envio recusa alterar registro de outro
usuário ou do catálogo (403) e trata referência a eles como inexistente (409).
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from pydantic import model_validator
from sqlalchemy import ColumnElement, or_, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, col, select

from backend.models import (
    ComVersao,
    Exercicio,
    ExercicioBase,
    ExercicioOut,
    Ficha,
    FichaBase,
    FichaExercicio,
    FichaExercicioBase,
    FichaExercicioOut,
    FichaOut,
    Meta,
    MetaBase,
    MetaOut,
    RegistroDiario,
    RegistroDiarioBase,
    RegistroDiarioOut,
    Serie,
    SerieBase,
    SerieOut,
    Sessao,
    SessaoBase,
    SessaoOut,
    Sincronizavel,
    SyncContador,
)

MAX_REGISTROS_POR_ENVIO = 5000


@dataclass(frozen=True)
class Referencia:
    campo: str  # pode ser um UUID, nulo ou uma lista de UUIDs (alternativas)
    alvo: type[ComVersao]


@dataclass(frozen=True)
class Tabela:
    nome: str
    modelo: type[ComVersao]
    saida: type[SQLModel]
    referencias: tuple[Referencia, ...] = ()


# Ordem das chaves estrangeiras: pais antes dos filhos.
TABELAS: tuple[Tabela, ...] = (
    Tabela("exercicios", Exercicio, ExercicioOut),
    Tabela("fichas", Ficha, FichaOut),
    Tabela(
        "ficha_exercicios",
        FichaExercicio,
        FichaExercicioOut,
        (
            Referencia("ficha_id", Ficha),
            Referencia("exercicio_id", Exercicio),
            Referencia("alternativas", Exercicio),
        ),
    ),
    Tabela("sessoes", Sessao, SessaoOut, (Referencia("ficha_id", Ficha),)),
    Tabela(
        "series",
        Serie,
        SerieOut,
        (
            Referencia("sessao_id", Sessao),
            Referencia("exercicio_id", Exercicio),
            Referencia("ficha_exercicio_id", FichaExercicio),
        ),
    ),
    Tabela("registros_diarios", RegistroDiario, RegistroDiarioOut),
    Tabela("metas", Meta, MetaOut, (Referencia("exercicio_id", Exercicio),)),
)


class Mudancas(SQLModel):
    exercicios: list[ExercicioBase] = []
    fichas: list[FichaBase] = []
    ficha_exercicios: list[FichaExercicioBase] = []
    sessoes: list[SessaoBase] = []
    series: list[SerieBase] = []
    registros_diarios: list[RegistroDiarioBase] = []
    metas: list[MetaBase] = []

    @model_validator(mode="after")
    def _limitar_tamanho(self) -> "Mudancas":
        if self.total() > MAX_REGISTROS_POR_ENVIO:
            raise ValueError(f"no máximo {MAX_REGISTROS_POR_ENVIO} registros por envio")
        return self

    def total(self) -> int:
        return sum(len(getattr(self, t.nome)) for t in TABELAS)


class Pacote(SQLModel):
    cursor: int
    exercicios: list[ExercicioOut] = []
    fichas: list[FichaOut] = []
    ficha_exercicios: list[FichaExercicioOut] = []
    sessoes: list[SessaoOut] = []
    series: list[SerieOut] = []
    registros_diarios: list[RegistroDiarioOut] = []
    metas: list[MetaOut] = []


class ResultadoEnvio(SQLModel):
    cursor: int
    aplicados: int
    ignorados: int


class ReferenciaInvalida(Exception):
    """Um registro aponta para outro que não existe (ou que não é do usuário)."""


class RegistroAlheio(Exception):
    """O envio tenta alterar um registro de outro usuário ou do catálogo."""


def visivel_para(modelo: type[ComVersao], usuario_id: uuid.UUID) -> ColumnElement[bool]:
    """Registros que o usuário enxerga: os dele e, no caso dos exercícios, os do catálogo."""
    dono = col(modelo.usuario_id)  # type: ignore[attr-defined]
    if modelo is Exercicio:
        return or_(dono == usuario_id, dono.is_(None))
    return dono == usuario_id


def cursor_atual(session: Session) -> int:
    valor = session.exec(select(SyncContador.valor).where(SyncContador.id == 1)).first()
    return valor or 0


def proxima_versao(session: Session) -> int:
    """Incrementa o contador global dentro da transação atual e devolve o novo valor."""
    stmt = (
        update(SyncContador)
        .where(col(SyncContador.id) == 1)
        .values(valor=col(SyncContador.valor) + 1)
        .returning(col(SyncContador.valor))
    )
    valor = session.connection().execute(stmt).scalar_one_or_none()
    if valor is None:
        session.add(SyncContador(id=1, valor=1))
        session.flush()
        return 1
    return valor


def gravar(
    session: Session,
    tabela: Tabela,
    dados: dict[str, Any],
    usuario_id: uuid.UUID,
    versao: int,
) -> bool:
    """Insere ou atualiza um registro do usuário se ele for mais recente que o do servidor."""
    existente = session.get(tabela.modelo, dados["id"])
    if existente is None:
        session.add(tabela.modelo(**dados, usuario_id=usuario_id, versao=versao))
        return True
    if existente.usuario_id != usuario_id:  # type: ignore[attr-defined]
        raise RegistroAlheio(
            f"Um registro de '{tabela.nome}' não pode ser alterado (é do catálogo ou de outra "
            "pessoa). Nada foi gravado."
        )
    if dados["atualizado_em"] <= existente.atualizado_em:  # type: ignore[attr-defined]
        return False
    for campo, valor in dados.items():
        setattr(existente, campo, valor)
    existente.versao = versao
    return True


def _mais_recentes(registros: list[Sincronizavel]) -> list[Sincronizavel]:
    """Se o mesmo id vier repetido no envio, fica a versão mais recente."""
    por_id: dict[uuid.UUID, Sincronizavel] = {}
    for registro in registros:
        atual = por_id.get(registro.id)
        if atual is None or registro.atualizado_em > atual.atualizado_em:
            por_id[registro.id] = registro
    return list(por_id.values())


def _ids_referenciados(dados: dict[str, Any], campo: str) -> list[uuid.UUID]:
    valor = dados[campo]
    if valor is None:
        return []
    return list(valor) if isinstance(valor, list) else [valor]


def _conferir_referencias(
    session: Session,
    usuario_id: uuid.UUID,
    referencias: dict[tuple[str, type[ComVersao]], set[uuid.UUID]],
) -> None:
    """Toda referência gravada precisa apontar para um registro que o usuário enxerga.

    Roda depois de gravar o envio inteiro (ainda na mesma transação), então vale apontar para
    registros que vieram no mesmo envio, em qualquer ordem.
    """
    for (nome_tabela, alvo), ids in referencias.items():
        id_alvo = col(alvo.id)  # type: ignore[attr-defined]
        encontrados = set(
            session.exec(
                select(id_alvo).where(id_alvo.in_(ids), visivel_para(alvo, usuario_id))
            ).all()
        )
        if ids - encontrados:
            raise ReferenciaInvalida(
                f"Um registro de '{nome_tabela}' aponta para outro que não existe. "
                "Nada foi gravado."
            )


def aplicar_mudancas(session: Session, usuario_id: uuid.UUID, mudancas: Mudancas) -> ResultadoEnvio:
    total = mudancas.total()
    if total == 0:
        return ResultadoEnvio(cursor=cursor_atual(session), aplicados=0, ignorados=0)

    versao = proxima_versao(session)
    aplicados = 0
    referencias: dict[tuple[str, type[ComVersao]], set[uuid.UUID]] = defaultdict(set)
    tabela_atual = TABELAS[0].nome
    try:
        for tabela in TABELAS:
            tabela_atual = tabela.nome
            for registro in _mais_recentes(getattr(mudancas, tabela.nome)):
                dados = registro.model_dump()
                if not gravar(session, tabela, dados, usuario_id, versao):
                    continue
                aplicados += 1
                for ref in tabela.referencias:
                    ids = _ids_referenciados(dados, ref.campo)
                    referencias[(tabela.nome, ref.alvo)].update(ids)
            session.flush()
        _conferir_referencias(session, usuario_id, referencias)
        session.commit()
    except IntegrityError as erro:
        session.rollback()
        raise ReferenciaInvalida(
            f"Um registro de '{tabela_atual}' aponta para outro que não existe ou repete um que "
            "já existe. Nada foi gravado."
        ) from erro
    except (ReferenciaInvalida, RegistroAlheio):
        session.rollback()
        raise

    return ResultadoEnvio(cursor=versao, aplicados=aplicados, ignorados=total - aplicados)


def coletar_mudancas(session: Session, usuario_id: uuid.UUID, desde: int) -> Pacote:
    cursor = cursor_atual(session)
    if desde > cursor:
        # Cursor de outro banco (ex.: banco recriado): reenvia tudo para o app se realinhar.
        desde = 0
    conteudo: dict[str, list[SQLModel]] = {}
    for tabela in TABELAS:
        versao = col(tabela.modelo.versao)
        stmt = (
            select(tabela.modelo)
            .where(versao > desde, versao <= cursor, visivel_para(tabela.modelo, usuario_id))
            .order_by(versao)
        )
        conteudo[tabela.nome] = [
            tabela.saida.model_validate(registro, from_attributes=True)
            for registro in session.exec(stmt).all()
        ]
    return Pacote(cursor=cursor, **conteudo)
