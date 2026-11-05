from datetime import UTC, datetime
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlmodel import Session, select

from backend.models import Exercicio, Ficha, FichaExercicio
from backend.seed import (
    ARQUIVO_PADRAO,
    Catalogo,
    carregar_catalogo,
    id_de,
    ler_catalogo,
)
from backend.sync import cursor_atual


def catalogo(**alteracoes: object) -> Catalogo:
    dados: dict[str, object] = {
        "exercicios": [
            {
                "slug": "supino-reto-barra",
                "nome": "Supino reto com barra",
                "grupo_muscular": "Peito",
                "substituto": "supino-reto-maquina",
            },
            {
                "slug": "supino-reto-maquina",
                "nome": "Supino reto na máquina",
                "grupo_muscular": "Peito",
            },
        ],
        "fichas": [
            {
                "slug": "peito-triceps",
                "nome": "Peito e Tríceps",
                "ordem": 1,
                "exercicios": [
                    {"exercicio": "supino-reto-barra", "series": 4, "repeticoes": "8-10"},
                ],
            }
        ],
    }
    dados.update(alteracoes)
    return Catalogo.model_validate(dados)


def test_carrega_catalogo(session: Session) -> None:
    assert carregar_catalogo(session, catalogo()) == 4

    principal = session.get(Exercicio, id_de("exercicio", "supino-reto-barra"))
    assert principal is not None
    assert principal.substituto_id == id_de("exercicio", "supino-reto-maquina")

    item = session.exec(select(FichaExercicio)).one()
    assert item.ficha_id == id_de("ficha", "peito-triceps")
    assert (item.series, item.repeticoes) == (4, "8-10")


def test_rodar_de_novo_nao_altera_nada(session: Session) -> None:
    carregar_catalogo(session, catalogo())
    cursor = cursor_atual(session)
    assert carregar_catalogo(session, catalogo()) == 0
    assert cursor_atual(session) == cursor


def test_so_o_que_mudou_recebe_versao_nova(session: Session) -> None:
    carregar_catalogo(session, catalogo())
    cursor = cursor_atual(session)

    alterado = catalogo().model_dump()
    alterado["fichas"][0]["exercicios"][0]["series"] = 3
    assert carregar_catalogo(session, Catalogo.model_validate(alterado)) == 1

    item = session.exec(select(FichaExercicio)).one()
    assert item.series == 3
    assert item.versao == cursor + 1
    ficha = session.get(Ficha, id_de("ficha", "peito-triceps"))
    assert ficha is not None and ficha.versao == cursor


def test_item_removido_do_arquivo_fica_excluido(session: Session) -> None:
    carregar_catalogo(session, catalogo())
    sem_itens = catalogo().model_dump()
    sem_itens["fichas"][0]["exercicios"] = []
    carregar_catalogo(session, Catalogo.model_validate(sem_itens))

    item = session.exec(select(FichaExercicio)).one()
    assert item.excluido is True


def test_preserva_midia_escolhida_no_app(session: Session) -> None:
    carregar_catalogo(session, catalogo())
    exercicio = session.get(Exercicio, id_de("exercicio", "supino-reto-barra"))
    assert exercicio is not None
    exercicio.midia_url = "https://exemplo.com/supino.gif"
    exercicio.atualizado_em = datetime.now(UTC)
    session.commit()

    alterado = catalogo().model_dump()
    alterado["exercicios"][0]["nome"] = "Supino reto (barra)"
    carregar_catalogo(session, Catalogo.model_validate(alterado))

    session.refresh(exercicio)
    assert exercicio.nome == "Supino reto (barra)"
    assert exercicio.midia_url == "https://exemplo.com/supino.gif"


@pytest.mark.parametrize(
    "alteracao",
    [
        {"exercicios": [{"slug": "a", "nome": "A", "grupo_muscular": "X", "substituto": "b"}]},
        {"exercicios": [{"slug": "a", "nome": "A", "grupo_muscular": "X", "substituto": "a"}]},
        {
            "fichas": [
                {
                    "slug": "f",
                    "nome": "F",
                    "ordem": 1,
                    "exercicios": [{"exercicio": "nao-existe", "series": 3, "repeticoes": "10"}],
                }
            ]
        },
        {"exercicios": [{"slug": "a", "nome": "A", "grupo_muscular": "X", "campo_errado": 1}]},
    ],
)
def test_catalogo_invalido(alteracao: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        catalogo(**alteracao)


def test_arquivo_do_projeto_e_valido() -> None:
    ler_catalogo(ARQUIVO_PADRAO)


def test_main_carrega_arquivo(tmp_path: Path, session: Session) -> None:
    from backend.seed import main

    arquivo = tmp_path / "treino.toml"
    arquivo.write_text(
        '[[exercicios]]\nslug = "rosca"\nnome = "Rosca direta"\ngrupo_muscular = "Bíceps"\n',
        encoding="utf-8",
    )
    assert main(["seed", str(arquivo)], abrir_sessao=lambda: Session(session.get_bind())) == 0
    assert session.get(Exercicio, id_de("exercicio", "rosca")) is not None
