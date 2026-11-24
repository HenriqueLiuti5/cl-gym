from datetime import UTC, datetime
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlmodel import Session, select

from backend.models import Exercicio, Ficha, FichaExercicio, Usuario
from backend.seed import (
    ARQUIVO_PADRAO,
    Catalogo,
    carregar_catalogo,
    id_de,
    ler_catalogo,
)
from backend.sync import cursor_atual


def ficha_com(*itens: dict[str, object]) -> dict[str, object]:
    return {"fichas": [{"slug": "f", "nome": "F", "ordem": 1, "exercicios": list(itens)}]}


def catalogo(**alteracoes: object) -> Catalogo:
    dados: dict[str, object] = {
        "exercicios": [
            {
                "slug": "supino-reto-barra",
                "nome": "Supino reto com barra",
                "grupo_muscular": "Peito",
            },
            {
                "slug": "supino-reto-maquina",
                "nome": "Supino reto na máquina",
                "grupo_muscular": "Peito",
            },
            {
                "slug": "supino-reto-halter",
                "nome": "Supino reto com halteres",
                "grupo_muscular": "Peito",
            },
        ],
        "fichas": [
            {
                "slug": "peito-triceps",
                "nome": "Peito e Tríceps",
                "ordem": 1,
                "exercicios": [
                    {
                        "exercicio": "supino-reto-barra",
                        "series": 3,
                        "alvo_reps": 8,
                        "aquecimento": True,
                        "grupo_biset": 1,
                        "alternativas": ["supino-reto-maquina", "supino-reto-halter"],
                    },
                ],
            }
        ],
    }
    dados.update(alteracoes)
    return Catalogo.model_validate(dados)


def test_carrega_catalogo(session: Session) -> None:
    assert carregar_catalogo(session, catalogo()) == 5

    principal = session.get(Exercicio, id_de("exercicio", "supino-reto-barra"))
    assert principal is not None
    assert principal.usuario_id is None  # catálogo

    item = session.exec(select(FichaExercicio)).one()
    assert item.ficha_id == id_de("ficha", "peito-triceps")
    assert item.usuario_id is None
    assert (item.series, item.alvo_reps, item.aquecimento, item.grupo_biset) == (3, 8, True, 1)
    # O Plano B volta como UUIDs, na ordem do arquivo.
    assert item.alternativas == [
        id_de("exercicio", "supino-reto-maquina"),
        id_de("exercicio", "supino-reto-halter"),
    ]


def test_rodar_de_novo_nao_altera_nada(session: Session) -> None:
    carregar_catalogo(session, catalogo())
    cursor = cursor_atual(session)
    assert carregar_catalogo(session, catalogo()) == 0
    assert cursor_atual(session) == cursor


def test_so_o_que_mudou_recebe_versao_nova(session: Session) -> None:
    carregar_catalogo(session, catalogo())
    cursor = cursor_atual(session)

    alterado = catalogo().model_dump()
    alterado["fichas"][0]["exercicios"][0]["series"] = 4
    assert carregar_catalogo(session, Catalogo.model_validate(alterado)) == 1

    item = session.exec(select(FichaExercicio)).one()
    assert item.series == 4
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


def test_alternativas_alteradas_recebem_versao_nova(session: Session) -> None:
    carregar_catalogo(session, catalogo())
    alterado = catalogo().model_dump()
    alterado["fichas"][0]["exercicios"][0]["alternativas"] = ["supino-reto-halter"]
    assert carregar_catalogo(session, Catalogo.model_validate(alterado)) == 1
    item = session.exec(select(FichaExercicio)).one()
    assert item.alternativas == [id_de("exercicio", "supino-reto-halter")]


def test_seed_devolve_ao_catalogo_um_id_usado_por_usuario(session: Session) -> None:
    usuario = Usuario(google_sub="x", email="x@exemplo.com", criado_em=datetime.now(UTC))
    session.add(usuario)
    session.flush()
    # Alguém criou pelo app um exercício com o mesmo id de um slug do catálogo.
    session.add(
        Exercicio(
            id=id_de("exercicio", "supino-reto-barra"),
            usuario_id=usuario.id,
            atualizado_em=datetime.now(UTC),
            nome="Falso",
            grupo_muscular="Peito",
        )
    )
    session.commit()

    carregar_catalogo(session, catalogo())
    exercicio = session.get(Exercicio, id_de("exercicio", "supino-reto-barra"))
    assert exercicio is not None
    assert (exercicio.usuario_id, exercicio.nome) == (None, "Supino reto com barra")


@pytest.mark.parametrize(
    "alteracao",
    [
        ficha_com({"exercicio": "nao-existe", "series": 3, "alvo_reps": 10}),
        ficha_com({"exercicio": "supino-reto-barra", "series": 3, "alvo_reps": 10, "x": 1}),
        # Faixa de reps não vale mais: o alvo é um número só.
        ficha_com({"exercicio": "supino-reto-barra", "series": 3, "alvo_reps": "8-12"}),
        ficha_com(
            {"exercicio": "supino-reto-barra", "series": 3, "alvo_reps": 8, "alternativas": ["x"]}
        ),
        ficha_com(
            {
                "exercicio": "supino-reto-barra",
                "series": 3,
                "alvo_reps": 8,
                "alternativas": ["supino-reto-barra"],
            }
        ),
        ficha_com(
            {
                "exercicio": "supino-reto-barra",
                "series": 3,
                "alvo_reps": 8,
                "alternativas": ["supino-reto-maquina", "supino-reto-maquina"],
            }
        ),
        ficha_com(
            {
                "exercicio": "supino-reto-barra",
                "series": 3,
                "alvo_reps": 8,
                "alternativas": ["supino-reto-maquina", "supino-reto-halter", "outro"],
            }
        ),
        {"exercicios": [{"slug": "a", "nome": "A", "grupo_muscular": "X", "substituto": "b"}]},
    ],
)
def test_catalogo_invalido(alteracao: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        catalogo(**alteracao)


def test_arquivo_do_projeto_segue_as_regras_do_treino() -> None:
    catalogo = ler_catalogo(ARQUIVO_PADRAO)
    assert [f.nome for f in sorted(catalogo.fichas, key=lambda f: f.ordem)] == [
        "Push",
        "Pull",
        "Leg day",
        "Upper",
    ]
    for ficha in catalogo.fichas:
        # Aquecimento só no primeiro exercício.
        assert [item.aquecimento for item in ficha.exercicios][0] is True
        assert not any(item.aquecimento for item in ficha.exercicios[1:]), ficha.slug
        # Bi-set é sempre um par de itens seguidos.
        grupos = [item.grupo_biset for item in ficha.exercicios if item.grupo_biset]
        assert all(grupos.count(g) == 2 for g in grupos), ficha.slug
    pull = next(f for f in catalogo.fichas if f.slug == "pull")
    remada = next(i for i in pull.exercicios if i.exercicio == "remada-articulada")
    assert remada.alternativas[0] == "remada-serrote"


def test_main_carrega_arquivo(tmp_path: Path, session: Session) -> None:
    from backend.seed import main

    arquivo = tmp_path / "treino.toml"
    arquivo.write_text(
        '[[exercicios]]\nslug = "rosca"\nnome = "Rosca direta"\ngrupo_muscular = "Bíceps"\n',
        encoding="utf-8",
    )
    assert main(["seed", str(arquivo)], abrir_sessao=lambda: Session(session.get_bind())) == 0
    assert session.get(Exercicio, id_de("exercicio", "rosca")) is not None
