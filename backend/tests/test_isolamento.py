"""O usuário A nunca baixa, altera nem referencia dados do B (e ninguém altera o catálogo)."""

from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.seed import Catalogo, carregar_catalogo, id_de
from backend.tests.dados import (
    T0,
    TABELAS,
    exercicio,
    iso,
    novo_id,
    pacote_vazio,
    treino_completo,
)


def enviar_treino_do_a(client: TestClient) -> tuple[dict[str, Any], dict[str, str]]:
    corpo, ids = treino_completo()
    resposta = client.post("/api/sync", json=corpo)
    assert resposta.status_code == 200, resposta.text
    return corpo, ids


def carregar_catalogo_simples(session: Session) -> str:
    carregar_catalogo(
        session,
        Catalogo.model_validate(
            {
                "exercicios": [
                    {"slug": "agachamento", "nome": "Agachamento", "grupo_muscular": "Perna"}
                ],
                "fichas": [
                    {
                        "slug": "leg-day",
                        "nome": "Leg day",
                        "ordem": 1,
                        "exercicios": [{"exercicio": "agachamento", "series": 3, "alvo_reps": 8}],
                    }
                ],
            }
        ),
    )
    return str(id_de("exercicio", "agachamento"))


# --- Download -------------------------------------------------------------------------------


def test_b_nao_baixa_nada_do_a(client: TestClient, client_b: TestClient) -> None:
    enviar_treino_do_a(client)
    assert pacote_vazio(client_b.get("/api/sync").json())
    # Nem com o cursor zerado de novo (banco "recriado").
    assert pacote_vazio(client_b.get("/api/sync", params={"desde": 10**6}).json())
    # E a A continua vendo tudo o que é dela.
    pacote_a = client.get("/api/sync").json()
    assert all(len(pacote_a[t]) == 1 for t in TABELAS)


def test_catalogo_e_baixado_por_todos(
    session: Session, client: TestClient, client_b: TestClient
) -> None:
    agachamento = carregar_catalogo_simples(session)
    for c in (client, client_b):
        exercicios = c.get("/api/sync").json()["exercicios"]
        assert [(e["id"], e["usuario_id"]) for e in exercicios] == [(agachamento, None)]


def test_fichas_modelo_nao_sao_baixadas(
    session: Session, client: TestClient, client_b: TestClient
) -> None:
    # A e B entraram antes de existir o modelo: não recebem cópia e não veem o modelo.
    carregar_catalogo_simples(session)
    for c in (client, client_b):
        pacote = c.get("/api/sync").json()
        assert pacote["fichas"] == []
        assert pacote["ficha_exercicios"] == []


# --- Alterar registro alheio ----------------------------------------------------------------


@pytest.mark.parametrize("tabela", TABELAS)
def test_b_nao_altera_registro_do_a(client: TestClient, client_b: TestClient, tabela: str) -> None:
    corpo_a, _ = enviar_treino_do_a(client)
    antes = client.get("/api/sync").json()

    alterado = dict(corpo_a[tabela][0], atualizado_em=iso(T0 + timedelta(days=1)), excluido=True)
    resposta = client_b.post("/api/sync", json={tabela: [alterado]})
    assert resposta.status_code == 403
    assert tabela in resposta.json()["detail"]

    assert client.get("/api/sync").json() == antes
    assert pacote_vazio(client_b.get("/api/sync").json())


def test_envio_recusado_nao_grava_nada(client: TestClient, client_b: TestClient) -> None:
    corpo_a, _ = enviar_treino_do_a(client)
    alheio = dict(corpo_a["exercicios"][0], atualizado_em=iso(T0 + timedelta(days=1)))
    proprio = exercicio(novo_id(), nome="Do Bruno")
    resposta = client_b.post("/api/sync", json={"exercicios": [proprio, alheio]})
    assert resposta.status_code == 403
    assert pacote_vazio(client_b.get("/api/sync").json())


def test_ninguem_altera_o_catalogo(
    session: Session, client: TestClient, client_b: TestClient
) -> None:
    agachamento = carregar_catalogo_simples(session)
    for c in (client, client_b):
        resposta = c.post(
            "/api/sync",
            json={
                "exercicios": [
                    exercicio(agachamento, T0 + timedelta(days=365), nome="Hackeado", excluido=True)
                ]
            },
        )
        assert resposta.status_code == 403
    exercicios = client.get("/api/sync").json()["exercicios"]
    assert [e["nome"] for e in exercicios] == ["Agachamento"]


def test_usuario_id_enviado_pelo_app_e_ignorado(client: TestClient, client_b: TestClient) -> None:
    id_a = client.get("/api/conta").json()["id"]
    id_b = client_b.get("/api/conta").json()["id"]
    novo = novo_id()
    # O B tenta criar um exercício "em nome" da A.
    resposta = client_b.post("/api/sync", json={"exercicios": [exercicio(novo, usuario_id=id_a)]})
    assert resposta.status_code == 200
    assert client.get("/api/sync").json()["exercicios"] == []
    (criado,) = client_b.get("/api/sync").json()["exercicios"]
    assert criado["usuario_id"] == id_b


# --- Referenciar registro alheio ------------------------------------------------------------


def _referencias_ao_a(ids_a: dict[str, str]) -> list[tuple[str, dict[str, Any]]]:
    """Envios do B em que um campo aponta para um registro da A."""
    corpo_b, _ = treino_completo()
    casos: list[tuple[str, dict[str, Any]]] = []

    def caso(tabela: str, campo: str, valor: Any) -> None:
        corpo = {t: [dict(r) for r in registros] for t, registros in corpo_b.items()}
        corpo[tabela][0][campo] = valor
        casos.append((tabela, corpo))

    caso("ficha_exercicios", "ficha_id", ids_a["ficha"])
    caso("ficha_exercicios", "exercicio_id", ids_a["ex"])
    caso("ficha_exercicios", "alternativas", [ids_a["ex"]])
    caso("sessoes", "ficha_id", ids_a["ficha"])
    caso("series", "sessao_id", ids_a["sessao"])
    caso("series", "exercicio_id", ids_a["ex"])
    caso("series", "ficha_exercicio_id", ids_a["item"])
    caso("metas", "exercicio_id", ids_a["ex"])
    return casos


def test_b_nao_referencia_registros_do_a(client: TestClient, client_b: TestClient) -> None:
    _, ids_a = enviar_treino_do_a(client)
    antes = client.get("/api/sync").json()

    casos = _referencias_ao_a(ids_a)
    assert len(casos) == 8
    for tabela, corpo in casos:
        resposta = client_b.post("/api/sync", json=corpo)
        assert resposta.status_code == 409, (tabela, resposta.text)
        assert tabela in resposta.json()["detail"]
        # Mesma mensagem de "não existe": não revela que o registro é de outra pessoa.
        assert "não existe" in resposta.json()["detail"]
        assert pacote_vazio(client_b.get("/api/sync").json())

    assert client.get("/api/sync").json() == antes


def test_b_nao_referencia_ficha_modelo(session: Session, client_b: TestClient) -> None:
    carregar_catalogo_simples(session)
    corpo, _ = treino_completo()
    corpo["sessoes"][0]["ficha_id"] = str(id_de("ficha", "leg-day"))
    resposta = client_b.post("/api/sync", json=corpo)
    assert resposta.status_code == 409


def test_pode_referenciar_exercicio_do_catalogo(
    session: Session, client: TestClient, client_b: TestClient
) -> None:
    agachamento = carregar_catalogo_simples(session)
    for c in (client, client_b):
        corpo, _ = treino_completo()
        corpo["ficha_exercicios"][0]["alternativas"] = [agachamento]
        corpo["series"][0]["exercicio_id"] = agachamento
        resposta = c.post("/api/sync", json=corpo)
        assert resposta.status_code == 200, resposta.text


def test_mesma_data_em_usuarios_diferentes_nao_conflita(
    client: TestClient, client_b: TestClient
) -> None:
    for c in (client, client_b):
        corpo, _ = treino_completo()
        assert c.post("/api/sync", json=corpo).status_code == 200
    assert len(client.get("/api/sync").json()["registros_diarios"]) == 1
    assert len(client_b.get("/api/sync").json()["registros_diarios"]) == 1
