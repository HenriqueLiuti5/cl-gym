import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

T0 = datetime(2026, 11, 3, 18, 0, tzinfo=UTC)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def novo_id() -> str:
    return str(uuid.uuid4())


def exercicio(id_: str, quando: datetime = T0, **extra: Any) -> dict[str, Any]:
    return {
        "id": id_,
        "atualizado_em": iso(quando),
        "nome": "Supino reto com barra",
        "grupo_muscular": "Peito",
        **extra,
    }


def treino_completo() -> tuple[dict[str, Any], dict[str, str]]:
    ids = {nome: novo_id() for nome in ("ex", "ficha", "item", "sessao", "serie")}
    corpo = {
        "exercicios": [exercicio(ids["ex"])],
        "fichas": [{"id": ids["ficha"], "atualizado_em": iso(T0), "nome": "Peito e Tríceps"}],
        "ficha_exercicios": [
            {
                "id": ids["item"],
                "atualizado_em": iso(T0),
                "ficha_id": ids["ficha"],
                "exercicio_id": ids["ex"],
                "series": 4,
                "repeticoes": "8-10",
            }
        ],
        "sessoes": [
            {
                "id": ids["sessao"],
                "atualizado_em": iso(T0),
                "ficha_id": ids["ficha"],
                "iniciada_em": iso(T0),
                "finalizada_em": iso(T0 + timedelta(hours=1)),
            }
        ],
        "series": [
            {
                "id": ids["serie"],
                "atualizado_em": iso(T0),
                "sessao_id": ids["sessao"],
                "exercicio_id": ids["ex"],
                "ficha_exercicio_id": ids["item"],
                "numero": 1,
                "carga_kg": 32.5,
                "repeticoes": 10,
            }
        ],
    }
    return corpo, ids


def test_envio_e_download_completo(client: TestClient) -> None:
    corpo, ids = treino_completo()

    envio = client.post("/api/sync", json=corpo)
    assert envio.status_code == 200, envio.text
    assert envio.json()["aplicados"] == 5
    assert envio.json()["ignorados"] == 0

    pacote = client.get("/api/sync", params={"desde": 0}).json()
    assert pacote["cursor"] == envio.json()["cursor"]
    for tabela in ("exercicios", "fichas", "ficha_exercicios", "sessoes", "series"):
        assert len(pacote[tabela]) == 1
    serie = pacote["series"][0]
    assert serie["id"] == ids["serie"]
    assert serie["carga_kg"] == 32.5
    assert serie["versao"] == pacote["cursor"]
    # Datas sempre voltam em UTC com fuso.
    assert datetime.fromisoformat(pacote["sessoes"][0]["iniciada_em"]) == T0


def test_download_incremental_traz_so_o_que_mudou(client: TestClient) -> None:
    corpo, _ = treino_completo()
    cursor = client.post("/api/sync", json=corpo).json()["cursor"]

    assert all(
        v == []
        for k, v in client.get("/api/sync", params={"desde": cursor}).json().items()
        if k != "cursor"
    )

    novo = novo_id()
    client.post("/api/sync", json={"exercicios": [exercicio(novo, nome="Crucifixo")]})
    pacote = client.get("/api/sync", params={"desde": cursor}).json()
    assert [e["id"] for e in pacote["exercicios"]] == [novo]
    assert pacote["series"] == []


def test_escrita_mais_recente_vence(client: TestClient) -> None:
    id_ = novo_id()
    client.post("/api/sync", json={"exercicios": [exercicio(id_, T0, nome="Original")]})

    antigo = client.post(
        "/api/sync", json={"exercicios": [exercicio(id_, T0 - timedelta(minutes=5), nome="Velho")]}
    )
    assert antigo.json()["ignorados"] == 1

    novo = client.post(
        "/api/sync", json={"exercicios": [exercicio(id_, T0 + timedelta(minutes=5), nome="Novo")]}
    )
    assert novo.json()["aplicados"] == 1

    exercicios = client.get("/api/sync").json()["exercicios"]
    assert [e["nome"] for e in exercicios] == ["Novo"]


def test_reenviar_o_mesmo_registro_nao_duplica(client: TestClient) -> None:
    corpo, _ = treino_completo()
    client.post("/api/sync", json=corpo)
    segunda = client.post("/api/sync", json=corpo).json()
    assert segunda["aplicados"] == 0
    assert segunda["ignorados"] == 5
    assert len(client.get("/api/sync").json()["series"]) == 1


def test_id_repetido_no_mesmo_envio_fica_o_mais_recente(client: TestClient) -> None:
    id_ = novo_id()
    corpo = {
        "exercicios": [
            exercicio(id_, T0 + timedelta(minutes=1), nome="Mais recente"),
            exercicio(id_, T0, nome="Mais antigo"),
        ]
    }
    assert client.post("/api/sync", json=corpo).status_code == 200
    assert client.get("/api/sync").json()["exercicios"][0]["nome"] == "Mais recente"


def test_exclusao_logica_e_propagada(client: TestClient) -> None:
    id_ = novo_id()
    client.post("/api/sync", json={"exercicios": [exercicio(id_)]})
    cursor = client.get("/api/sync").json()["cursor"]

    client.post(
        "/api/sync",
        json={"exercicios": [exercicio(id_, T0 + timedelta(minutes=1), excluido=True)]},
    )
    pacote = client.get("/api/sync", params={"desde": cursor}).json()
    assert pacote["exercicios"][0]["excluido"] is True


def test_substituto_pode_vir_depois_no_mesmo_envio(client: TestClient) -> None:
    principal, substituto = novo_id(), novo_id()
    corpo = {
        "exercicios": [
            exercicio(principal, substituto_id=substituto),
            exercicio(substituto, nome="Supino reto na máquina"),
        ]
    }
    resposta = client.post("/api/sync", json=corpo)
    assert resposta.status_code == 200, resposta.text
    por_id = {e["id"]: e for e in client.get("/api/sync").json()["exercicios"]}
    assert por_id[principal]["substituto_id"] == substituto


def test_referencia_inexistente_nao_grava_nada(client: TestClient) -> None:
    ex = novo_id()
    corpo = {
        "exercicios": [exercicio(ex)],
        "series": [
            {
                "id": novo_id(),
                "atualizado_em": iso(T0),
                "sessao_id": novo_id(),  # sessão que não existe
                "exercicio_id": ex,
                "numero": 1,
                "carga_kg": 20,
                "repeticoes": 12,
            }
        ],
    }
    resposta = client.post("/api/sync", json=corpo)
    assert resposta.status_code == 409
    assert "series" in resposta.json()["detail"]
    assert client.get("/api/sync").json()["exercicios"] == []


@pytest.mark.parametrize(
    ("campo", "valor"),
    [
        ("atualizado_em", "2026-11-03T18:00:00"),  # sem fuso horário
        ("nome", ""),
        ("grupo_muscular", "x" * 61),
    ],
)
def test_exercicio_invalido_e_recusado(client: TestClient, campo: str, valor: str) -> None:
    resposta = client.post(
        "/api/sync", json={"exercicios": [exercicio(novo_id(), **{campo: valor})]}
    )
    assert resposta.status_code == 422


def test_carga_negativa_e_recusada(client: TestClient) -> None:
    corpo, _ = treino_completo()
    corpo["series"][0]["carga_kg"] = -5
    assert client.post("/api/sync", json=corpo).status_code == 422


def test_sessao_que_termina_antes_de_comecar_e_recusada(client: TestClient) -> None:
    corpo, _ = treino_completo()
    corpo["sessoes"][0]["finalizada_em"] = iso(T0 - timedelta(minutes=1))
    assert client.post("/api/sync", json=corpo).status_code == 422


def test_envio_vazio_nao_avanca_cursor(client: TestClient) -> None:
    resposta = client.post("/api/sync", json={})
    assert resposta.json() == {"cursor": 0, "aplicados": 0, "ignorados": 0}


def test_cursor_maior_que_o_do_servidor_reenvia_tudo(client: TestClient) -> None:
    client.post("/api/sync", json={"exercicios": [exercicio(novo_id())]})
    pacote = client.get("/api/sync", params={"desde": 999}).json()
    assert len(pacote["exercicios"]) == 1
