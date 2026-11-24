"""Modelos do banco e esquemas de sincronização.

Para cada entidade sincronizável há:
- `XBase`: campos que o app envia/recebe (validados pelo Pydantic);
- `X` (table=True): a tabela, com `versao` e `usuario_id`, ambos controlados pelo servidor;
- `XOut`: o que o servidor devolve no download (`XBase` + `versao`).

O `id` (UUID) é gerado pelo app, `atualizado_em` decide conflitos (a escrita mais recente vence)
e `excluido` faz exclusão lógica para propagar remoções.

O `usuario_id` nunca vem do app: o servidor o define a partir do token de sessão. Exercícios e
fichas com `usuario_id` nulo são do catálogo (carregado pelo seed): os exercícios são baixados
por todos, e as fichas são os modelos copiados para cada usuário no primeiro login.
"""

import datetime as dt
import uuid
from typing import Self

from pydantic import AwareDatetime, model_validator
from sqlalchemy import JSON, UniqueConstraint
from sqlmodel import Field, SQLModel

from backend.db import ListaUUID, UTCDateTime

# --- Usuários -------------------------------------------------------------------------------


class Metas(SQLModel):
    meta_kcal: int | None = Field(default=None, ge=0, le=20000)
    meta_proteina_g: float | None = Field(default=None, ge=0, le=1000)
    meta_peso_kg: float | None = Field(default=None, gt=0, le=500)


class Usuario(Metas, table=True):
    __tablename__ = "usuarios"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Identificador fixo da conta Google (o e-mail pode mudar).
    google_sub: str = Field(max_length=255, unique=True, index=True)
    email: str = Field(max_length=320)
    nome: str | None = Field(default=None, max_length=200)
    criado_em: AwareDatetime = Field(sa_type=UTCDateTime)


class UsuarioOut(Metas):
    id: uuid.UUID
    email: str
    nome: str | None
    criado_em: AwareDatetime


# --- Base da sincronização ------------------------------------------------------------------


class Sincronizavel(SQLModel):
    id: uuid.UUID = Field(primary_key=True)
    atualizado_em: AwareDatetime = Field(sa_type=UTCDateTime)
    excluido: bool = False


class ComVersao(SQLModel):
    # Valor do contador global no momento em que o servidor gravou o registro (cursor do download).
    versao: int = Field(default=0, index=True)


class DoCatalogoOuUsuario(SQLModel):
    # Nulo = catálogo compartilhado (seed).
    usuario_id: uuid.UUID | None = Field(default=None, foreign_key="usuarios.id", index=True)


class DoUsuario(SQLModel):
    usuario_id: uuid.UUID = Field(foreign_key="usuarios.id", index=True)


# --- Exercícios -----------------------------------------------------------------------------


class ExercicioBase(Sincronizavel):
    nome: str = Field(min_length=1, max_length=120)
    grupo_muscular: str = Field(min_length=1, max_length=60)
    # URLs das imagens de demonstração (ex.: posição inicial e final, exibidas em sequência).
    imagens: list[str] = Field(default_factory=list, sa_type=JSON)
    instrucoes: list[str] = Field(default_factory=list, sa_type=JSON)
    # Link de GIF/vídeo de demonstração.
    midia_url: str | None = Field(default=None, max_length=500)


class Exercicio(ComVersao, DoCatalogoOuUsuario, ExercicioBase, table=True):
    __tablename__ = "exercicios"


class ExercicioOut(ComVersao, DoCatalogoOuUsuario, ExercicioBase):
    """Traz o `usuario_id` para o app saber o que é do catálogo (só leitura)."""


# --- Fichas (treinos: Push, Pull, Leg day, Upper...) ----------------------------------------


class FichaBase(Sincronizavel):
    nome: str = Field(min_length=1, max_length=60)
    # Ordem de exibição e desempate da sugestão do dia.
    ordem: int = Field(default=0, ge=0)


class Ficha(ComVersao, DoCatalogoOuUsuario, FichaBase, table=True):
    """Com `usuario_id` nulo é uma ficha modelo: não é baixada, só copiada no primeiro login."""

    __tablename__ = "fichas"


class FichaOut(ComVersao, FichaBase):
    pass


MAX_ALTERNATIVAS = 2


class FichaExercicioBase(Sincronizavel):
    ficha_id: uuid.UUID = Field(foreign_key="fichas.id", index=True)
    exercicio_id: uuid.UUID = Field(foreign_key="exercicios.id")
    ordem: int = Field(default=0, ge=0)
    series: int = Field(ge=1, le=20)
    # Um número só, nunca faixa: todas as séries com o mesmo peso, parando a 1–2 reps da falha.
    alvo_reps: int = Field(ge=1, le=100)
    # Faz 1×10 leve (~50% do peso) antes; não conta como série.
    aquecimento: bool = False
    # Itens da mesma ficha com o mesmo número são feitos em sequência (bi-set).
    grupo_biset: int | None = Field(default=None, ge=1, le=100)
    # Plano B: até 2 exercícios, em ordem de preferência, para quando o aparelho estiver ocupado.
    alternativas: list[uuid.UUID] = Field(default_factory=list, sa_type=ListaUUID)
    # Dicas de execução.
    observacao: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _validar_alternativas(self) -> Self:
        if len(self.alternativas) > MAX_ALTERNATIVAS:
            raise ValueError(f"no máximo {MAX_ALTERNATIVAS} alternativas")
        if len(set(self.alternativas)) != len(self.alternativas):
            raise ValueError("alternativa repetida")
        if self.exercicio_id in self.alternativas:
            raise ValueError("o exercício não pode ser alternativa de si mesmo")
        return self


class FichaExercicio(ComVersao, DoCatalogoOuUsuario, FichaExercicioBase, table=True):
    __tablename__ = "ficha_exercicios"


class FichaExercicioOut(ComVersao, FichaExercicioBase):
    pass


# --- Treinos realizados ---------------------------------------------------------------------


class SessaoBase(Sincronizavel):
    # Ficha seguida no treino (nula para treino avulso).
    ficha_id: uuid.UUID | None = Field(default=None, foreign_key="fichas.id", index=True)
    iniciada_em: AwareDatetime = Field(sa_type=UTCDateTime)
    finalizada_em: AwareDatetime | None = Field(default=None, sa_type=UTCDateTime)
    observacao: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _fim_depois_do_inicio(self) -> Self:
        if self.finalizada_em is not None and self.finalizada_em < self.iniciada_em:
            raise ValueError("finalizada_em não pode ser anterior a iniciada_em")
        return self


class Sessao(ComVersao, DoUsuario, SessaoBase, table=True):
    __tablename__ = "sessoes"


class SessaoOut(ComVersao, SessaoBase):
    pass


class SerieBase(Sincronizavel):
    sessao_id: uuid.UUID = Field(foreign_key="sessoes.id", index=True)
    # Exercício realmente executado (pode ser uma alternativa do planejado).
    exercicio_id: uuid.UUID = Field(foreign_key="exercicios.id", index=True)
    # Item da ficha que esta série cumpre (nulo se o exercício foi feito fora da ficha).
    ficha_exercicio_id: uuid.UUID | None = Field(default=None, foreign_key="ficha_exercicios.id")
    numero: int = Field(ge=1, le=50)
    carga_kg: float = Field(ge=0, le=1000)
    repeticoes: int = Field(ge=0, le=1000)


class Serie(ComVersao, DoUsuario, SerieBase, table=True):
    __tablename__ = "series"


class SerieOut(ComVersao, SerieBase):
    pass


# --- Peso e alimentação ---------------------------------------------------------------------


class RegistroDiarioBase(Sincronizavel):
    """Um por dia. Como só pode haver um por data, o app deve gerar o `id` de forma
    determinística a partir do usuário e da data (ex.: UUID v5), igual em todos os aparelhos."""

    data: dt.date
    peso_kg: float | None = Field(default=None, gt=0, le=500)  # em jejum
    kcal: int | None = Field(default=None, ge=0, le=20000)
    proteina_g: float | None = Field(default=None, ge=0, le=1000)
    observacao: str | None = Field(default=None, max_length=500)


class RegistroDiario(ComVersao, DoUsuario, RegistroDiarioBase, table=True):
    __tablename__ = "registros_diarios"
    __table_args__ = (UniqueConstraint("usuario_id", "data"),)


class RegistroDiarioOut(ComVersao, RegistroDiarioBase):
    pass


# --- Controle da sincronização --------------------------------------------------------------


class SyncContador(SQLModel, table=True):
    """Linha única com o contador global; cada gravação recebe o próximo valor como `versao`."""

    __tablename__ = "sync_contador"

    id: int = Field(default=1, primary_key=True)
    valor: int = 0
