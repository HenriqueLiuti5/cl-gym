"""Carrega o catálogo de treino (exercícios e fichas modelo) de um arquivo TOML para o banco.

Uso:
    uv run python -m backend.seed                  # usa backend/data/treino.toml
    uv run python -m backend.seed outro.toml

Pode rodar quantas vezes quiser: os ids são derivados dos slugs (sempre os mesmos) e só o que
mudou no arquivo é regravado — e recebe uma `versao` nova, então os celulares baixam a mudança.
Itens removidos de uma ficha no arquivo são marcados como excluídos.

Tudo o que o seed grava é do catálogo (`usuario_id` nulo): os exercícios são baixados por todos e
ninguém os altera pelo app; as fichas são modelos, copiados para cada usuário no primeiro login
(mudar uma ficha modelo depois não altera as cópias que já existem).
"""

import sys
import tomllib
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlmodel import Session, col, select

from backend.models import MAX_ALTERNATIVAS, ComVersao, Exercicio, Ficha, FichaExercicio
from backend.sync import proxima_versao

ARQUIVO_PADRAO = Path(__file__).parent / "data" / "treino.toml"
# Namespace fixo: o mesmo slug gera sempre o mesmo UUID, em qualquer máquina.
NAMESPACE = uuid.UUID("5a0c7c52-3f7e-4d6b-9a51-2c8f0e6b9d14")


def id_de(tipo: str, slug: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, f"{tipo}:{slug}")


# --- Formato do arquivo ---------------------------------------------------------------------


class _Estrito(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ExercicioSeed(_Estrito):
    slug: str = Field(min_length=1)
    nome: str = Field(min_length=1, max_length=120)
    grupo_muscular: str = Field(min_length=1, max_length=60)
    imagens: list[str] = []
    instrucoes: list[str] = []
    midia_url: str | None = Field(default=None, max_length=500)


class ItemSeed(_Estrito):
    exercicio: str
    series: int = Field(ge=1, le=20)
    alvo_reps: int = Field(ge=1, le=100)
    aquecimento: bool = False
    grupo_biset: int | None = Field(default=None, ge=1, le=100)
    # Plano B: slugs de até 2 exercícios, em ordem de preferência.
    alternativas: list[str] = Field(default=[], max_length=MAX_ALTERNATIVAS)
    observacao: str | None = Field(default=None, max_length=300)


class FichaSeed(_Estrito):
    slug: str = Field(min_length=1)
    nome: str = Field(min_length=1, max_length=60)
    ordem: int = Field(ge=0)
    exercicios: list[ItemSeed] = []


class Catalogo(_Estrito):
    exercicios: list[ExercicioSeed] = []
    fichas: list[FichaSeed] = []

    @model_validator(mode="after")
    def _validar_referencias(self) -> "Catalogo":
        slugs = [e.slug for e in self.exercicios]
        if len(slugs) != len(set(slugs)):
            raise ValueError("slug de exercício repetido")
        if len({f.slug for f in self.fichas}) != len(self.fichas):
            raise ValueError("slug de ficha repetido")
        conhecidos = set(slugs)
        for ficha in self.fichas:
            usados = [item.exercicio for item in ficha.exercicios]
            if len(usados) != len(set(usados)):
                raise ValueError(f"exercício repetido na ficha '{ficha.slug}'")
            for item in ficha.exercicios:
                for slug in (item.exercicio, *item.alternativas):
                    if slug not in conhecidos:
                        raise ValueError(f"exercício '{slug}' da ficha '{ficha.slug}' não existe")
                if len(set(item.alternativas)) != len(item.alternativas):
                    raise ValueError(f"alternativa repetida em '{item.exercicio}' ({ficha.slug})")
                if item.exercicio in item.alternativas:
                    raise ValueError(
                        f"'{item.exercicio}' não pode ser alternativa de si mesmo ({ficha.slug})"
                    )
        return self


def ler_catalogo(caminho: Path) -> Catalogo:
    with caminho.open("rb") as arquivo:
        return Catalogo.model_validate(tomllib.load(arquivo))


# --- Gravação -------------------------------------------------------------------------------


class _Gravador:
    """Aplica só os campos que mudaram; pede uma versão nova apenas se algo mudar."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.agora = datetime.now(UTC)
        # (tabela, id) de cada registro criado/alterado — um registro conta uma vez só.
        self.alterados: set[tuple[str, uuid.UUID]] = set()
        self._versao: int | None = None

    def versao(self) -> int:
        if self._versao is None:
            self._versao = proxima_versao(self.session)
        return self._versao

    def gravar(self, modelo: type[ComVersao], id_: uuid.UUID, campos: dict[str, Any]) -> None:
        existente = self.session.get(modelo, id_)
        if existente is None:
            self.session.add(
                modelo(id=id_, atualizado_em=self.agora, versao=self.versao(), **campos)
            )
            self.alterados.add((modelo.__name__, id_))
            return
        if all(getattr(existente, campo) == valor for campo, valor in campos.items()):
            return
        for campo, valor in campos.items():
            setattr(existente, campo, valor)
        existente.atualizado_em = self.agora  # type: ignore[attr-defined]
        existente.versao = self.versao()
        self.alterados.add((modelo.__name__, id_))


def carregar_catalogo(session: Session, catalogo: Catalogo) -> int:
    """Grava o catálogo e devolve quantos registros foram criados ou alterados."""
    g = _Gravador(session)

    # `usuario_id` nulo em tudo: é catálogo, mesmo que alguém tenha usado o mesmo id antes.
    for e in catalogo.exercicios:
        g.gravar(
            Exercicio,
            id_de("exercicio", e.slug),
            {
                "usuario_id": None,
                "nome": e.nome,
                "grupo_muscular": e.grupo_muscular,
                "imagens": e.imagens,
                "instrucoes": e.instrucoes,
                "midia_url": e.midia_url,
                "excluido": False,
            },
        )
    session.flush()

    for f in catalogo.fichas:
        ficha_id = id_de("ficha", f.slug)
        g.gravar(
            Ficha,
            ficha_id,
            {"usuario_id": None, "nome": f.nome, "ordem": f.ordem, "excluido": False},
        )
        session.flush()

        ids_no_arquivo = set()
        for ordem, item in enumerate(f.exercicios):
            item_id = id_de("ficha_exercicio", f"{f.slug}:{item.exercicio}")
            ids_no_arquivo.add(item_id)
            g.gravar(
                FichaExercicio,
                item_id,
                {
                    "usuario_id": None,
                    "ficha_id": ficha_id,
                    "exercicio_id": id_de("exercicio", item.exercicio),
                    "ordem": ordem,
                    "series": item.series,
                    "alvo_reps": item.alvo_reps,
                    "aquecimento": item.aquecimento,
                    "grupo_biset": item.grupo_biset,
                    "alternativas": [id_de("exercicio", slug) for slug in item.alternativas],
                    "observacao": item.observacao,
                    "excluido": False,
                },
            )
        sobras = session.exec(
            select(FichaExercicio).where(
                FichaExercicio.ficha_id == ficha_id,
                col(FichaExercicio.id).not_in(ids_no_arquivo),
            )
        ).all()
        for sobra in sobras:
            g.gravar(FichaExercicio, sobra.id, {"excluido": True})

    session.commit()
    return len(g.alterados)


def main(argv: list[str], abrir_sessao: Callable[[], Session] | None = None) -> int:
    caminho = Path(argv[1]) if len(argv) > 1 else ARQUIVO_PADRAO
    try:
        catalogo = ler_catalogo(caminho)
    except (OSError, tomllib.TOMLDecodeError, ValidationError) as erro:
        print(f"Erro ao ler {caminho}:\n{erro}", file=sys.stderr)
        return 1

    if abrir_sessao is None:
        from backend.db import get_engine

        def abrir_sessao() -> Session:
            return Session(get_engine())

    with abrir_sessao() as session:
        alterados = carregar_catalogo(session, catalogo)
    print(
        f"{len(catalogo.exercicios)} exercícios e {len(catalogo.fichas)} fichas modelo no arquivo; "
        f"{alterados} registros criados/alterados."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
