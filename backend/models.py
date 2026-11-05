"""Modelos do banco e esquemas de sincronização.

Para cada entidade há:
- `XBase`: campos que o app envia/recebe (validados pelo Pydantic);
- `X` (table=True): a tabela, com a coluna `versao` controlada pelo servidor;
- `XOut`: o que o servidor devolve no download (`XBase` + `versao`).

Todos os registros são sincronizáveis: o `id` (UUID) é gerado pelo app, `atualizado_em` decide
conflitos (a escrita mais recente vence) e `excluido` faz exclusão lógica para propagar remoções.
"""

import uuid
from typing import Self

from pydantic import AwareDatetime, model_validator
from sqlalchemy import JSON
from sqlmodel import Field, SQLModel

from backend.db import UTCDateTime


class Sincronizavel(SQLModel):
    id: uuid.UUID = Field(primary_key=True)
    atualizado_em: AwareDatetime = Field(sa_type=UTCDateTime)
    excluido: bool = False


class ComVersao(SQLModel):
    # Valor do contador global no momento em que o servidor gravou o registro (cursor do download).
    versao: int = Field(default=0, index=True)


# --- Exercícios -----------------------------------------------------------------------------


class ExercicioBase(Sincronizavel):
    nome: str = Field(min_length=1, max_length=120)
    grupo_muscular: str = Field(min_length=1, max_length=60)
    # URLs das imagens de demonstração (ex.: posição inicial e final, exibidas em sequência).
    imagens: list[str] = Field(default_factory=list, sa_type=JSON)
    instrucoes: list[str] = Field(default_factory=list, sa_type=JSON)
    # Link de GIF/vídeo escolhido pelo usuário no app (o seed nunca sobrescreve).
    midia_url: str | None = Field(default=None, max_length=500)
    # Exercício que trabalha exatamente o mesmo músculo, para quando o aparelho estiver ocupado.
    substituto_id: uuid.UUID | None = Field(default=None, foreign_key="exercicios.id")


class Exercicio(ComVersao, ExercicioBase, table=True):
    __tablename__ = "exercicios"


class ExercicioOut(ComVersao, ExercicioBase):
    pass


# --- Fichas (treinos: Peito e Tríceps, Costas e Bíceps, ...) --------------------------------


class FichaBase(Sincronizavel):
    nome: str = Field(min_length=1, max_length=60)
    # Ordem de exibição e desempate da sugestão do dia.
    ordem: int = Field(default=0, ge=0)


class Ficha(ComVersao, FichaBase, table=True):
    __tablename__ = "fichas"


class FichaOut(ComVersao, FichaBase):
    pass


class FichaExercicioBase(Sincronizavel):
    ficha_id: uuid.UUID = Field(foreign_key="fichas.id", index=True)
    exercicio_id: uuid.UUID = Field(foreign_key="exercicios.id")
    ordem: int = Field(default=0, ge=0)
    series: int = Field(ge=1, le=20)
    # Texto livre: "10", "8-12", "até a falha"...
    repeticoes: str = Field(min_length=1, max_length=30)
    observacao: str | None = Field(default=None, max_length=300)


class FichaExercicio(ComVersao, FichaExercicioBase, table=True):
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


class Sessao(ComVersao, SessaoBase, table=True):
    __tablename__ = "sessoes"


class SessaoOut(ComVersao, SessaoBase):
    pass


class SerieBase(Sincronizavel):
    sessao_id: uuid.UUID = Field(foreign_key="sessoes.id", index=True)
    # Exercício realmente executado (pode ser o substituto do planejado).
    exercicio_id: uuid.UUID = Field(foreign_key="exercicios.id", index=True)
    # Item da ficha que esta série cumpre (nulo se o exercício foi feito fora da ficha).
    ficha_exercicio_id: uuid.UUID | None = Field(default=None, foreign_key="ficha_exercicios.id")
    numero: int = Field(ge=1, le=50)
    carga_kg: float = Field(ge=0, le=1000)
    repeticoes: int = Field(ge=0, le=1000)


class Serie(ComVersao, SerieBase, table=True):
    __tablename__ = "series"


class SerieOut(ComVersao, SerieBase):
    pass


# --- Controle da sincronização --------------------------------------------------------------


class SyncContador(SQLModel, table=True):
    """Linha única com o contador global; cada gravação recebe o próximo valor como `versao`."""

    __tablename__ = "sync_contador"

    id: int = Field(default=1, primary_key=True)
    valor: int = 0
