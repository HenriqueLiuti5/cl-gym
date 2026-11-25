import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func
from sqlmodel import Session, col, select

from backend.models import (
    Exercicio,
    Ficha,
    FichaExercicio,
    Meta,
    RegistroDiario,
    Serie,
    Sessao,
    Usuario,
)
from backend.seed import id_de
from backend.tests.conftest import EMAIL_A, Entrar
from backend.tests.dados import T0, TABELAS, iso, treino_completo
from backend.tests.test_auth import com_token
from backend.tests.test_isolamento import carregar_catalogo_simples

MODELOS_DO_USUARIO = (Exercicio, Ficha, FichaExercicio, Sessao, Serie, RegistroDiario, Meta)


def registros_do_usuario(session: Session, usuario_id: uuid.UUID) -> int:
    session.expire_all()
    total = 0
    for modelo in MODELOS_DO_USUARIO:
        stmt = select(func.count()).where(col(modelo.usuario_id) == usuario_id)
        total += session.exec(stmt).one()
    return total


# --- Perfil ---------------------------------------------------------------------------------


def test_conta_comeca_sem_altura_e_idade(client: TestClient) -> None:
    conta = client.get("/api/conta").json()
    assert conta["email"] == EMAIL_A
    assert conta["nome"] == "Ana"  # veio do Google
    assert (conta["altura_cm"], conta["idade"]) == (None, None)
    # As metas não ficam na conta: são registros sincronizáveis (tabela `metas`).
    assert not any(campo.startswith("meta") for campo in conta)


def test_altera_so_os_campos_enviados(client: TestClient) -> None:
    client.patch("/api/conta", json={"nome": "Aninha", "altura_cm": 165})
    conta = client.patch("/api/conta", json={"idade": 29}).json()
    assert (conta["nome"], conta["altura_cm"], conta["idade"]) == ("Aninha", 165, 29)
    assert client.patch("/api/conta", json={"idade": None}).json()["idade"] is None


@pytest.mark.parametrize(
    "corpo",
    [
        {"altura_cm": 49},
        {"altura_cm": 251},
        {"altura_cm": 1.75},  # em metros: o app converte para cm antes de enviar
        {"idade": 9},
        {"idade": 121},
        {"nome": ""},
        {"nome": "x" * 201},
    ],
)
def test_perfil_invalido_e_recusado(client: TestClient, corpo: dict[str, object]) -> None:
    assert client.patch("/api/conta", json=corpo).status_code == 422


def test_perfil_e_de_cada_um(client: TestClient, client_b: TestClient) -> None:
    client.patch("/api/conta", json={"altura_cm": 180, "idade": 30})
    conta_b = client_b.get("/api/conta").json()
    assert (conta_b["altura_cm"], conta_b["idade"]) == (None, None)


def test_nome_escolhido_no_app_fica_depois_de_entrar_de_novo(
    entrar: Entrar, anonimo: TestClient
) -> None:
    token = entrar()
    anonimo.patch("/api/conta", headers=com_token(token), json={"nome": "Aninha"})
    entrar(name="Ana Maria")
    assert anonimo.get("/api/conta", headers=com_token(token)).json()["nome"] == "Aninha"


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
    assert registros_do_usuario(session, id_b) == 7
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
