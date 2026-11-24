import uuid
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func
from sqlmodel import Session, col, select

from backend.models import (
    Exercicio,
    Ficha,
    FichaExercicio,
    RegistroDiario,
    Serie,
    Sessao,
    Usuario,
)
from backend.seed import id_de
from backend.tests.conftest import EMAIL_A, Entrar
from backend.tests.dados import T0, TABELAS, exercicio, iso, novo_id, treino_completo
from backend.tests.test_auth import com_token
from backend.tests.test_isolamento import carregar_catalogo_simples

MODELOS_DO_USUARIO = (Exercicio, Ficha, FichaExercicio, Sessao, Serie, RegistroDiario)


def registros_do_usuario(session: Session, usuario_id: uuid.UUID) -> int:
    session.expire_all()
    total = 0
    for modelo in MODELOS_DO_USUARIO:
        stmt = select(func.count()).where(col(modelo.usuario_id) == usuario_id)
        total += session.exec(stmt).one()
    return total


# --- Metas ----------------------------------------------------------------------------------


def test_conta_comeca_sem_metas(client: TestClient) -> None:
    conta = client.get("/api/conta").json()
    assert conta["email"] == EMAIL_A
    assert (conta["meta_kcal"], conta["meta_proteina_g"], conta["meta_peso_kg"]) == (
        None,
        None,
        None,
    )


def test_altera_so_as_metas_enviadas(client: TestClient) -> None:
    client.patch("/api/conta", json={"meta_kcal": 2200, "meta_peso_kg": 78.5})
    conta = client.patch("/api/conta", json={"meta_proteina_g": 160}).json()
    assert (conta["meta_kcal"], conta["meta_proteina_g"], conta["meta_peso_kg"]) == (
        2200,
        160,
        78.5,
    )
    assert client.patch("/api/conta", json={"meta_kcal": None}).json()["meta_kcal"] is None


def test_meta_invalida_e_recusada(client: TestClient) -> None:
    assert client.patch("/api/conta", json={"meta_peso_kg": -1}).status_code == 422


def test_metas_sao_de_cada_um(client: TestClient, client_b: TestClient) -> None:
    client.patch("/api/conta", json={"meta_kcal": 2200})
    assert client_b.get("/api/conta").json()["meta_kcal"] is None


# --- Exportar -------------------------------------------------------------------------------


def test_exporta_tudo_do_usuario(
    session: Session, client: TestClient, client_b: TestClient
) -> None:
    agachamento = carregar_catalogo_simples(session)
    corpo, ids = treino_completo()
    client.post("/api/sync", json=corpo)
    # Excluído no app também vai para a exportação.
    apagado = novo_id()
    client.post("/api/sync", json={"exercicios": [exercicio(apagado, excluido=True)]})
    client_b.post("/api/sync", json=treino_completo()[0])

    resposta = client.get("/api/conta/exportar")
    assert resposta.status_code == 200
    assert "attachment" in resposta.headers["content-disposition"]
    dados = resposta.json()
    assert dados["usuario"]["email"] == EMAIL_A
    assert "exportado_em" in dados
    for tabela in TABELAS:
        if tabela != "exercicios":
            assert len(dados[tabela]) == 1, tabela
    assert {e["id"] for e in dados["exercicios"]} == {ids["ex"], apagado, agachamento}
    assert dados["series"][0]["carga_kg"] == 32.5


def test_exportar_nao_traz_nada_do_outro(client: TestClient, client_b: TestClient) -> None:
    client.post("/api/sync", json=treino_completo()[0])
    dados = client_b.get("/api/conta/exportar").json()
    assert all(dados[t] == [] for t in TABELAS)


# --- Apagar ---------------------------------------------------------------------------------


def test_apagar_conta_apaga_tudo_de_verdade(
    session: Session, client: TestClient, client_b: TestClient
) -> None:
    carregar_catalogo_simples(session)
    id_a = uuid.UUID(client.get("/api/conta").json()["id"])
    id_b = uuid.UUID(client_b.get("/api/conta").json()["id"])
    corpo, _ = treino_completo()
    client.post("/api/sync", json=corpo)
    # Registro excluído no app também some.
    client.post(
        "/api/sync",
        json={
            "exercicios": [
                dict(corpo["exercicios"][0], atualizado_em=iso(T0 + timedelta(1)), excluido=True)
            ]
        },
    )
    client_b.post("/api/sync", json=treino_completo()[0])
    assert registros_do_usuario(session, id_a) > 0

    assert client.delete("/api/conta").status_code == 204

    assert registros_do_usuario(session, id_a) == 0
    assert session.get(Usuario, id_a) is None
    # O B e o catálogo continuam lá.
    assert registros_do_usuario(session, id_b) == 6
    assert session.get(Exercicio, id_de("exercicio", "agachamento")) is not None
    assert session.get(Ficha, id_de("ficha", "leg-day")) is not None
    # E o token da conta apagada para de funcionar.
    assert client.get("/api/sync").status_code == 401


def test_depois_de_apagar_pode_entrar_de_novo(entrar: Entrar, anonimo: TestClient) -> None:
    token = entrar()
    id_antigo = anonimo.get("/api/conta", headers=com_token(token)).json()["id"]
    anonimo.post("/api/sync", headers=com_token(token), json=treino_completo()[0])
    assert anonimo.delete("/api/conta", headers=com_token(token)).status_code == 204

    novo_token = entrar()
    conta = anonimo.get("/api/conta", headers=com_token(novo_token)).json()
    assert conta["id"] != id_antigo
    pacote = anonimo.get("/api/sync", headers=com_token(novo_token)).json()
    assert all(pacote[t] == [] for t in TABELAS)
