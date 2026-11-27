"""GET /api/modelos: as fichas modelo do catálogo, para o "Usar um modelo pronto" do app."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.models import Ficha, FichaExercicio
from backend.seed import Catalogo, carregar_catalogo, id_de
from backend.tests.dados import T0, iso, treino_completo
from backend.tests.test_auth import com_token


def catalogo() -> Catalogo:
    exercicios = ("supino", "supino-maquina", "supino-halter", "triceps-corda", "agachamento")
    return Catalogo.model_validate(
        {
            "exercicios": [
                {"slug": slug, "nome": slug.capitalize(), "grupo_muscular": "X"}
                for slug in exercicios
            ],
            # Fora de ordem no arquivo: a rota devolve pela `ordem`.
            "fichas": [
                {
                    "slug": "leg-day",
                    "nome": "Leg day",
                    "ordem": 2,
                    "exercicios": [{"exercicio": "agachamento", "series": 4, "alvo_reps": 6}],
                },
                {
                    "slug": "push",
                    "nome": "Push",
                    "ordem": 1,
                    "exercicios": [
                        {
                            "exercicio": "supino",
                            "series": 3,
                            "alvo_reps": 8,
                            "aquecimento": True,
                            "alternativas": ["supino-maquina", "supino-halter"],
                            "observacao": "Escápulas presas no banco",
                        },
                        {"exercicio": "triceps-corda", "series": 2, "alvo_reps": 12},
                    ],
                },
            ],
        }
    )


def ex(slug: str) -> str:
    return str(id_de("exercicio", slug))


def test_devolve_as_fichas_modelo_em_ordem(session: Session, client: TestClient) -> None:
    carregar_catalogo(session, catalogo())
    resposta = client.get("/api/modelos")
    assert resposta.status_code == 200, resposta.text
    # O formato exato que o app usa para copiar o modelo (sem bi-set).
    assert resposta.json() == [
        {
            "id": str(id_de("ficha", "push")),
            "nome": "Push",
            "ordem": 1,
            "exercicios": [
                {
                    "exercicio_id": ex("supino"),
                    "ordem": 0,
                    "series": 3,
                    "alvo_reps": 8,
                    "aquecimento": True,
                    "alternativas": [ex("supino-maquina"), ex("supino-halter")],
                    "observacao": "Escápulas presas no banco",
                },
                {
                    "exercicio_id": ex("triceps-corda"),
                    "ordem": 1,
                    "series": 2,
                    "alvo_reps": 12,
                    "aquecimento": False,
                    "alternativas": [],
                    "observacao": None,
                },
            ],
        },
        {
            "id": str(id_de("ficha", "leg-day")),
            "nome": "Leg day",
            "ordem": 2,
            "exercicios": [
                {
                    "exercicio_id": ex("agachamento"),
                    "ordem": 0,
                    "series": 4,
                    "alvo_reps": 6,
                    "aquecimento": False,
                    "alternativas": [],
                    "observacao": None,
                }
            ],
        },
    ]


def test_itens_em_ordem_e_sem_bi_set(session: Session, client: TestClient) -> None:
    carregar_catalogo(session, catalogo())
    # Modelo antigo: itens gravados fora da ordem e com o bi-set que o app não usa mais.
    supino = session.get(FichaExercicio, id_de("ficha_exercicio", "push:supino"))
    triceps = session.get(FichaExercicio, id_de("ficha_exercicio", "push:triceps-corda"))
    assert supino is not None and triceps is not None
    supino.ordem, triceps.ordem = 5, 2
    supino.grupo_biset = triceps.grupo_biset = 1
    session.commit()

    push = client.get("/api/modelos").json()[0]
    assert [i["exercicio_id"] for i in push["exercicios"]] == [ex("triceps-corda"), ex("supino")]
    assert [i["ordem"] for i in push["exercicios"]] == [2, 5]
    assert all("grupo_biset" not in i for i in push["exercicios"])


def test_sem_os_excluidos(session: Session, client: TestClient) -> None:
    carregar_catalogo(session, catalogo())
    # Item tirado do arquivo: o seed o marca como excluído.
    sem_triceps = catalogo().model_dump()
    sem_triceps["fichas"][1]["exercicios"].pop()
    carregar_catalogo(session, Catalogo.model_validate(sem_triceps))
    # Ficha modelo excluída.
    leg_day = session.get(Ficha, id_de("ficha", "leg-day"))
    assert leg_day is not None
    leg_day.excluido = True
    session.commit()

    modelos = client.get("/api/modelos").json()
    assert [m["nome"] for m in modelos] == ["Push"]
    assert [i["exercicio_id"] for i in modelos[0]["exercicios"]] == [ex("supino")]


def test_so_as_fichas_do_catalogo(
    session: Session, client: TestClient, client_b: TestClient
) -> None:
    carregar_catalogo(session, catalogo())
    # Fichas criadas (ou copiadas) pelas pessoas não são modelos.
    for c in (client, client_b):
        assert c.post("/api/sync", json=treino_completo()[0]).status_code == 200
    for c in (client, client_b):
        assert [m["nome"] for m in c.get("/api/modelos").json()] == ["Push", "Leg day"]


def test_sem_modelos(client: TestClient) -> None:
    assert client.get("/api/modelos").json() == []


def test_copia_do_modelo_vai_pela_sincronizacao(session: Session, client: TestClient) -> None:
    """O que o app faz em "Usar um modelo pronto": copia com ids novos e envia como dele."""
    carregar_catalogo(session, catalogo())
    push = client.get("/api/modelos").json()[0]
    ficha_id = str(uuid.uuid4())
    corpo = {
        "fichas": [
            {"id": ficha_id, "atualizado_em": iso(T0), "nome": push["nome"], "ordem": 0},
        ],
        "ficha_exercicios": [
            {**item, "id": str(uuid.uuid4()), "atualizado_em": iso(T0), "ficha_id": ficha_id}
            for item in push["exercicios"]
        ],
    }
    assert client.post("/api/sync", json=corpo).status_code == 200

    pacote = client.get("/api/sync").json()
    assert [f["id"] for f in pacote["fichas"]] == [ficha_id]
    assert len(pacote["ficha_exercicios"]) == 2
    # O modelo continua igual.
    assert client.get("/api/modelos").json()[0] == push


def test_exige_login(anonimo: TestClient) -> None:
    assert anonimo.get("/api/modelos").status_code == 401
    assert anonimo.get("/api/modelos", headers=com_token("token-errado")).status_code == 401


def test_conta_bloqueada_e_recusada(
    session: Session, client: TestClient, client_b: TestClient
) -> None:
    carregar_catalogo(session, catalogo())
    id_b = client_b.get("/api/conta").json()["id"]
    assert client.post(f"/api/admin/usuarios/{id_b}/bloquear").status_code == 200

    resposta = client_b.get("/api/modelos")
    assert resposta.status_code == 403
    assert resposta.headers["X-Motivo"] == "bloqueado"
