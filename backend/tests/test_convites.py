"""Convites: fora o admin, o único jeito de criar conta. Vale 24 h e serve para uma pessoa."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlmodel import Session, select

from backend import convites
from backend.convites import (
    ALFABETO,
    ConviteInvalido,
    formatar_codigo,
    gerar_codigo,
    normalizar_codigo,
    usar_convite,
)
from backend.models import Convite, Usuario
from backend.tests.conftest import EMAIL_A, EMAIL_B, Entrar, GerarIdToken, NovoConvite
from backend.tests.test_auth import _com_login_dev

EMAIL_C = "carla@exemplo.com"


@pytest.fixture
def login(anonimo: TestClient, id_token_google: GerarIdToken) -> Any:
    """Login com Google (o Bruno, por padrão), com ou sem convite."""

    def fazer(convite: str | None = None, email: str = EMAIL_B, sub: str = "sub-bruno") -> Response:
        corpo: dict[str, Any] = {"id_token": id_token_google(email=email, sub=sub)}
        if convite is not None:
            corpo["convite"] = convite
        return anonimo.post("/api/auth/google", json=corpo)

    return fazer


def no_banco(session: Session, codigo: str) -> Convite:
    session.expire_all()
    return session.exec(select(Convite).where(Convite.codigo == normalizar_codigo(codigo))).one()


def contas(session: Session) -> int:
    session.expire_all()
    return len(session.exec(select(Usuario)).all())


def recusado(resposta: Response, motivo: str, trecho: str) -> None:
    assert resposta.status_code == 403, resposta.text
    assert resposta.headers["X-Motivo"] == motivo
    assert trecho in resposta.json()["detail"]


# --- Código ---------------------------------------------------------------------------------


def test_codigo_tem_8_caracteres_sem_os_que_se_confundem() -> None:
    for _ in range(300):
        codigo = gerar_codigo()
        assert len(codigo) == 8
        assert set(codigo) <= set(ALFABETO)
    assert not set("01ILO") & set(ALFABETO)


def test_normaliza_e_formata_o_codigo() -> None:
    assert normalizar_codigo(" k7qm - x4pd ") == "K7QMX4PD"
    assert formatar_codigo("K7QMX4PD") == "K7QM-X4PD"


# --- Criar a conta --------------------------------------------------------------------------


def test_admin_cria_a_conta_sem_convite(login: Any, session: Session) -> None:
    resposta = login(email=EMAIL_A, sub="sub-ana")
    assert resposta.status_code == 200
    assert resposta.json()["novo"] is True
    assert resposta.json()["usuario"]["admin"] is True


def test_sem_convite_nao_cria_conta(login: Any, session: Session) -> None:
    recusado(login(), "sem-convite", "precisa de um convite")
    recusado(login("   "), "sem-convite", "precisa de um convite")
    assert contas(session) == 0


def test_convite_valido_cria_a_conta_e_e_gasto(
    login: Any, novo_convite: NovoConvite, session: Session
) -> None:
    codigo = novo_convite()
    resposta = login(codigo)
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["novo"] is True
    assert resposta.json()["usuario"]["admin"] is False

    convite = no_banco(session, codigo)
    assert convite.usado_em is not None
    assert str(convite.usado_por) == resposta.json()["usuario"]["id"]


def test_convite_serve_para_uma_pessoa_so(
    login: Any, novo_convite: NovoConvite, session: Session
) -> None:
    codigo = novo_convite()
    assert login(codigo).status_code == 200
    recusado(login(codigo, EMAIL_C, "sub-carla"), "convite-invalido", "já foi usado")
    # A conta da Carla não foi criada (nem as fichas dela).
    assert contas(session) == 1


@pytest.mark.parametrize(
    ("mudancas", "trecho"),
    [
        ({"expira_em": datetime.now(UTC) - timedelta(minutes=1)}, "expirou"),
        ({"cancelado_em": datetime.now(UTC)}, "cancelado"),
    ],
    ids=["expirado", "cancelado"],
)
def test_convite_que_nao_vale_mais(
    login: Any,
    novo_convite: NovoConvite,
    session: Session,
    mudancas: dict[str, datetime],
    trecho: str,
) -> None:
    recusado(login(novo_convite(**mudancas)), "convite-invalido", trecho)
    assert contas(session) == 0


@pytest.mark.parametrize("codigo", ["ZZZZ-ZZZZ", "ABC", "K7QM-X4PD-9"])
def test_codigo_que_nao_existe(login: Any, session: Session, codigo: str) -> None:
    recusado(login(codigo), "convite-invalido", "não encontrado")
    assert contas(session) == 0


def test_codigo_aceita_minusculas_hifen_e_espacos(login: Any, novo_convite: NovoConvite) -> None:
    codigo = novo_convite()
    digitado = f" {codigo[:4].lower()} - {codigo[4:].lower()} "
    assert login(digitado).status_code == 200


def test_quem_ja_tem_conta_entra_sem_gastar_o_convite(
    login: Any, entrar: Entrar, novo_convite: NovoConvite, session: Session
) -> None:
    entrar(EMAIL_B, "sub-bruno")  # cria a conta com um convite
    outro = novo_convite()
    resposta = login(outro)
    assert resposta.status_code == 200
    assert resposta.json()["novo"] is False
    assert no_banco(session, outro).usado_em is None  # fica para outra pessoa


def test_convite_usado_por_outro_ao_mesmo_tempo(
    session: Session, novo_convite: NovoConvite, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Se outra pessoa gastou o convite entre a conferência e a gravação, o UPDATE condicional
    não pega e o convite conta como usado."""
    codigo = novo_convite(usado_em=datetime.now(UTC))
    monkeypatch.setattr(convites, "situacao", lambda *_: "valido")
    with pytest.raises(ConviteInvalido) as erro:
        usar_convite(session, codigo, uuid.uuid4())
    assert erro.value.situacao == "usado"


def test_login_dev_segue_as_mesmas_regras(anonimo: TestClient, novo_convite: NovoConvite) -> None:
    _com_login_dev()
    sem = anonimo.post("/api/auth/dev", json={"email": EMAIL_C})
    assert (sem.status_code, sem.headers["X-Motivo"]) == (403, "sem-convite")
    com = anonimo.post("/api/auth/dev", json={"email": EMAIL_C, "convite": novo_convite()})
    assert com.status_code == 200
    assert com.json()["novo"] is True


# --- Rotas públicas -------------------------------------------------------------------------


def test_verificar_nao_gasta_nem_mostra_o_codigo(
    anonimo: TestClient, login: Any, novo_convite: NovoConvite, session: Session
) -> None:
    codigo = novo_convite()
    resposta = anonimo.post("/api/convites/verificar", json={"codigo": codigo.lower()})
    assert resposta.status_code == 200
    assert set(resposta.json()) == {"situacao", "expira_em"}
    assert resposta.json()["situacao"] == "valido"
    assert codigo not in resposta.text
    assert no_banco(session, codigo).usado_em is None
    assert login(codigo).status_code == 200  # continua servindo


@pytest.mark.parametrize(
    ("mudancas", "esperada"),
    [
        ({"expira_em": datetime.now(UTC) - timedelta(seconds=1)}, "expirado"),
        ({"cancelado_em": datetime.now(UTC)}, "cancelado"),
        ({"usado_em": datetime.now(UTC)}, "usado"),
    ],
)
def test_verificar_diz_a_situacao(
    anonimo: TestClient, novo_convite: NovoConvite, mudancas: dict[str, Any], esperada: str
) -> None:
    resposta = anonimo.post("/api/convites/verificar", json={"codigo": novo_convite(**mudancas)})
    assert resposta.json()["situacao"] == esperada


def test_verificar_codigo_que_nao_existe(anonimo: TestClient) -> None:
    resposta = anonimo.post("/api/convites/verificar", json={"codigo": "ZZZZ-ZZZZ"})
    assert resposta.status_code == 404
    assert "não encontrado" in resposta.json()["detail"]


def test_ver_convite_pelo_link(
    anonimo: TestClient, novo_convite: NovoConvite, session: Session
) -> None:
    codigo = novo_convite()
    convite = no_banco(session, codigo)
    resposta = anonimo.get(f"/api/convites/{convite.id}")
    assert resposta.status_code == 200
    assert set(resposta.json()) == {"situacao", "expira_em"}
    assert resposta.json()["situacao"] == "valido"
    assert codigo not in resposta.text
    assert anonimo.get(f"/api/convites/{uuid.uuid4()}").status_code == 404
    assert anonimo.get("/api/convites/nao-e-um-id").status_code == 422
