"""Sincronização offline-first entre o app e o servidor.

O app grava tudo localmente e, quando há conexão:
1. envia o que mudou (`POST /api/sync`);
2. baixa o que mudou desde o último cursor (`GET /api/sync?desde=<cursor>`) e guarda o novo cursor.

Cada envio aplicado recebe um número novo do contador global (`versao`). O download devolve os
registros com `desde < versao <= cursor`, lendo o cursor antes dos registros: assim um envio que
ainda não terminou nunca é pulado — ele simplesmente vem no próximo download.
"""

import uuid
from dataclasses import dataclass
from typing import Any

from pydantic import model_validator
from sqlalchemy import update
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
class Tabela:
    nome: str
    modelo: type[ComVersao]
    saida: type[SQLModel]


# Ordem das chaves estrangeiras: pais antes dos filhos.
TABELAS: tuple[Tabela, ...] = (
    Tabela("exercicios", Exercicio, ExercicioOut),
    Tabela("fichas", Ficha, FichaOut),
    Tabela("ficha_exercicios", FichaExercicio, FichaExercicioOut),
    Tabela("sessoes", Sessao, SessaoOut),
    Tabela("series", Serie, SerieOut),
)


class Mudancas(SQLModel):
    exercicios: list[ExercicioBase] = []
    fichas: list[FichaBase] = []
    ficha_exercicios: list[FichaExercicioBase] = []
    sessoes: list[SessaoBase] = []
    series: list[SerieBase] = []

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


class ResultadoEnvio(SQLModel):
    cursor: int
    aplicados: int
    ignorados: int


class ReferenciaInvalida(Exception):
    """Um registro aponta para outro que não existe no servidor nem no mesmo envio."""


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


def gravar(session: Session, modelo: type[ComVersao], dados: dict[str, Any], versao: int) -> bool:
    """Insere ou atualiza um registro se ele for mais recente que o do servidor."""
    existente = session.get(modelo, dados["id"])
    if existente is None:
        session.add(modelo(**dados, versao=versao))
        return True
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


def aplicar_mudancas(session: Session, mudancas: Mudancas) -> ResultadoEnvio:
    total = mudancas.total()
    if total == 0:
        return ResultadoEnvio(cursor=cursor_atual(session), aplicados=0, ignorados=0)

    versao = proxima_versao(session)
    aplicados = 0
    tabela_atual = TABELAS[0].nome
    try:
        for tabela in TABELAS:
            tabela_atual = tabela.nome
            # Exercícios apontam para outros exercícios (substituto): grava todos sem o vínculo
            # e liga depois, para não depender da ordem dentro do envio.
            substitutos: dict[uuid.UUID, uuid.UUID | None] = {}
            for registro in _mais_recentes(getattr(mudancas, tabela.nome)):
                dados = registro.model_dump()
                if tabela.modelo is Exercicio:
                    substitutos[dados["id"]] = dados["substituto_id"]
                    dados["substituto_id"] = None
                if gravar(session, tabela.modelo, dados, versao):
                    aplicados += 1
                else:
                    substitutos.pop(dados["id"], None)
            session.flush()
            for exercicio_id, substituto_id in substitutos.items():
                exercicio = session.get(Exercicio, exercicio_id)
                assert exercicio is not None
                exercicio.substituto_id = substituto_id
            session.flush()
        session.commit()
    except IntegrityError as erro:
        session.rollback()
        raise ReferenciaInvalida(
            f"Um registro de '{tabela_atual}' aponta para outro que não existe. Nada foi gravado."
        ) from erro

    return ResultadoEnvio(cursor=versao, aplicados=aplicados, ignorados=total - aplicados)


def coletar_mudancas(session: Session, desde: int) -> Pacote:
    cursor = cursor_atual(session)
    if desde > cursor:
        # Cursor de outro banco (ex.: banco recriado): reenvia tudo para o app se realinhar.
        desde = 0
    conteudo: dict[str, list[SQLModel]] = {}
    for tabela in TABELAS:
        versao = col(tabela.modelo.versao)
        stmt = select(tabela.modelo).where(versao > desde, versao <= cursor).order_by(versao)
        conteudo[tabela.nome] = [
            tabela.saida.model_validate(registro, from_attributes=True)
            for registro in session.exec(stmt).all()
        ]
    return Pacote(cursor=cursor, **conteudo)
