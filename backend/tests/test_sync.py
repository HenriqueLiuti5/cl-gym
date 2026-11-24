from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from backend.tests.dados import (
    T0,
    TABELAS,
    exercicio,
    iso,
    novo_id,
    pacote_vazio,
    treino_completo,
)


def test_envio_e_download_completo(client: TestClient) -> None:
    corpo, ids = treino_completo()

    envio = client.post("/api/sync", json=corpo)
    assert envio.status_code == 200, envio.text
    assert envio.json()["aplicados"] == 6
    assert envio.json()["ignorados"] == 0

    pacote = client.get("/api/sync", params={"desde": 0}).json()
    assert pacote["cursor"] == envio.json()["cursor"]
    for tabela in TABELAS:
        assert len(pacote[tabela]) == 1
    item = pacote["ficha_exercicios"][0]
    assert (item["alvo_reps"], item["aquecimento"], item["grupo_biset"]) == (8, True, None)
    assert item["alternativas"] == []
    assert pacote["registros_diarios"][0]["data"] == "2026-11-03"
    assert pacote["registros_diarios"][0]["peso_kg"] == 80.5
    assert pacote["exercicios"][0]["usuario_id"] is not None
    serie = pacote["series"][0]
    assert serie["id"] == ids["serie"]
    assert serie["carga_kg"] == 32.5
    assert serie["versao"] == pacote["cursor"]
    # Datas sempre voltam em UTC com fuso.
    assert datetime.fromisoformat(pacote["sessoes"][0]["iniciada_em"]) == T0


def test_download_incremental_traz_so_o_que_mudou(client: TestClient) -> None:
    corpo, _ = treino_completo()
    cursor = client.post("/api/sync", json=corpo).json()["cursor"]

    assert pacote_vazio(client.get("/api/sync", params={"desde": cursor}).json())

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
    assert segunda["ignorados"] == 6
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


def test_item_da_ficha_com_plano_b_e_bi_set(client: TestClient) -> None:
    corpo, _ = treino_completo()
    alt1, alt2 = novo_id(), novo_id()
    # As alternativas podem vir depois no mesmo envio.
    corpo["exercicios"] += [exercicio(alt1, nome="Supino máquina"), exercicio(alt2)]
    corpo["ficha_exercicios"][0].update(alternativas=[alt2, alt1], grupo_biset=1)
    resposta = client.post("/api/sync", json=corpo)
    assert resposta.status_code == 200, resposta.text

    item = client.get("/api/sync").json()["ficha_exercicios"][0]
    assert item["alternativas"] == [alt2, alt1]  # a ordem de preferência é mantida
    assert item["grupo_biset"] == 1


def test_mais_de_duas_alternativas_e_recusado(client: TestClient) -> None:
    corpo, _ = treino_completo()
    corpo["ficha_exercicios"][0]["alternativas"] = [novo_id() for _ in range(3)]
    assert client.post("/api/sync", json=corpo).status_code == 422


def test_alternativa_igual_ao_exercicio_e_recusada(client: TestClient) -> None:
    corpo, ids = treino_completo()
    corpo["ficha_exercicios"][0]["alternativas"] = [ids["ex"]]
    assert client.post("/api/sync", json=corpo).status_code == 422


def test_alternativa_inexistente_nao_grava_nada(client: TestClient) -> None:
    corpo, _ = treino_completo()
    corpo["ficha_exercicios"][0]["alternativas"] = [novo_id()]
    resposta = client.post("/api/sync", json=corpo)
    assert resposta.status_code == 409
    assert "ficha_exercicios" in resposta.json()["detail"]
    assert pacote_vazio(client.get("/api/sync").json())


def test_alvo_de_reps_em_faixa_e_recusado(client: TestClient) -> None:
    corpo, _ = treino_completo()
    corpo["ficha_exercicios"][0]["alvo_reps"] = "8-12"
    assert client.post("/api/sync", json=corpo).status_code == 422


def test_dois_registros_no_mesmo_dia_dao_conflito(client: TestClient) -> None:
    corpo, _ = treino_completo()
    client.post("/api/sync", json=corpo)
    outro = dict(corpo["registros_diarios"][0], id=novo_id())
    resposta = client.post("/api/sync", json={"registros_diarios": [outro]})
    assert resposta.status_code == 409
    assert "registros_diarios" in resposta.json()["detail"]


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
    assert pacote_vazio(client.get("/api/sync").json())


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
    cursor = client.get("/api/sync").json()["cursor"]
    resposta = client.post("/api/sync", json={})
    assert resposta.json() == {"cursor": cursor, "aplicados": 0, "ignorados": 0}


def test_cursor_maior_que_o_do_servidor_reenvia_tudo(client: TestClient) -> None:
    client.post("/api/sync", json={"exercicios": [exercicio(novo_id())]})
    pacote = client.get("/api/sync", params={"desde": 999}).json()
    assert len(pacote["exercicios"]) == 1
