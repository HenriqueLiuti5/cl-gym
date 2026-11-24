import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.auth import VerificadorGoogle, criar_token_sessao, get_verificador_google
from backend.main import app
from backend.seed import Catalogo, carregar_catalogo
from backend.tests.conftest import (
    CLIENT_ID,
    EMAIL_A,
    EMAIL_B,
    Entrar,
    GerarIdToken,
    configuracao,
)


def com_token(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- POST /api/auth/google ------------------------------------------------------------------


def test_login_devolve_token_de_sessao(anonimo: TestClient, id_token_google: GerarIdToken) -> None:
    resposta = anonimo.post("/api/auth/google", json={"id_token": id_token_google()})
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["novo"] is True
    assert corpo["usuario"]["email"] == EMAIL_A
    assert corpo["usuario"]["nome"] == "Ana"
    # Sessão de uns 90 dias.
    expira_em = datetime.fromisoformat(corpo["expira_em"])
    assert timedelta(days=89) < expira_em - datetime.now(UTC) <= timedelta(days=90)

    conta = anonimo.get("/api/conta", headers=com_token(corpo["token"]))
    assert conta.status_code == 200
    assert conta.json()["id"] == corpo["usuario"]["id"]


def test_segundo_login_acha_o_mesmo_usuario(
    anonimo: TestClient, id_token_google: GerarIdToken
) -> None:
    primeiro = anonimo.post("/api/auth/google", json={"id_token": id_token_google()}).json()
    # O e-mail e o nome podem mudar na conta Google; o `sub` é o que identifica.
    segundo = anonimo.post(
        "/api/auth/google",
        json={"id_token": id_token_google(email=EMAIL_A.upper(), name="Ana Maria")},
    ).json()
    assert segundo["novo"] is False
    assert segundo["usuario"]["id"] == primeiro["usuario"]["id"]
    assert segundo["usuario"]["email"] == EMAIL_A  # guardado em minúsculas
    assert segundo["usuario"]["nome"] == "Ana Maria"


def test_email_nao_convidado_e_recusado(anonimo: TestClient, id_token_google: GerarIdToken) -> None:
    resposta = anonimo.post(
        "/api/auth/google", json={"id_token": id_token_google(email="estranho@exemplo.com")}
    )
    assert resposta.status_code == 403
    assert "convidado" in resposta.json()["detail"]


def test_lista_de_convites_vazia_recusa_todo_mundo(
    anonimo: TestClient, id_token_google: GerarIdToken, convidar: Callable[[str], None]
) -> None:
    convidar("")
    resposta = anonimo.post("/api/auth/google", json={"id_token": id_token_google()})
    assert resposta.status_code == 403


def test_convite_ignora_maiusculas_e_espacos(
    anonimo: TestClient, id_token_google: GerarIdToken, convidar: Callable[[str], None]
) -> None:
    convidar(f"  {EMAIL_A.upper()} , {EMAIL_B}")
    resposta = anonimo.post("/api/auth/google", json={"id_token": id_token_google()})
    assert resposta.status_code == 200


@pytest.mark.parametrize(
    "campos",
    [
        {"aud": "outro-cliente.apps.googleusercontent.com"},
        {"iss": "https://falso.example.com"},
        {"exp": int(time.time()) - 3600, "iat": int(time.time()) - 7200},
        {"email_verified": False},
        {"email_verified": None},
        {"email": None},
        {"sub": None},
    ],
    ids=["aud", "iss", "vencido", "email-nao-verificado", "sem-email-verified", "sem-email", "sub"],
)
def test_id_token_invalido_e_recusado(
    anonimo: TestClient, id_token_google: GerarIdToken, campos: dict[str, object]
) -> None:
    resposta = anonimo.post("/api/auth/google", json={"id_token": id_token_google(**campos)})
    assert resposta.status_code == 401


def test_id_token_assinado_por_outra_chave_e_recusado(
    anonimo: TestClient, id_token_google: GerarIdToken
) -> None:
    outra = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    resposta = anonimo.post("/api/auth/google", json={"id_token": id_token_google(chave=outra)})
    assert resposta.status_code == 401


@pytest.mark.parametrize("id_token", ["isto-nao-e-um-jwt", "a.b.c"])
def test_id_token_malformado_e_recusado(anonimo: TestClient, id_token: str) -> None:
    assert anonimo.post("/api/auth/google", json={"id_token": id_token}).status_code == 401


def test_id_token_com_hs256_e_recusado(anonimo: TestClient) -> None:
    # Tentativa de "assinar" com um segredo qualquer em vez da chave do Google.
    falso = jwt.encode(
        {"iss": "accounts.google.com", "aud": CLIENT_ID, "sub": "x", "email": EMAIL_A},
        "segredo-qualquer-com-mais-de-32-bytes!!",
        algorithm="HS256",
    )
    assert anonimo.post("/api/auth/google", json={"id_token": falso}).status_code == 401


def test_google_fora_do_ar_da_503(anonimo: TestClient, id_token_google: GerarIdToken) -> None:
    def sem_rede(_token: str) -> object:
        raise jwt.PyJWKClientConnectionError("sem rede")

    app.dependency_overrides[get_verificador_google] = lambda: VerificadorGoogle(
        CLIENT_ID, obter_chave=sem_rede
    )
    resposta = anonimo.post("/api/auth/google", json={"id_token": id_token_google()})
    assert resposta.status_code == 503


# --- Token de sessão ------------------------------------------------------------------------


def test_sync_sem_token_e_recusado(anonimo: TestClient) -> None:
    assert anonimo.get("/api/sync").status_code == 401


@pytest.mark.parametrize("rota", ["/api/sync", "/api/conta", "/api/conta/exportar"])
def test_rotas_exigem_token(anonimo: TestClient, rota: str) -> None:
    assert anonimo.get(rota, headers=com_token("token-errado")).status_code == 401


def test_token_vencido_e_recusado(anonimo: TestClient, entrar: Entrar) -> None:
    usuario_id = uuid.UUID(anonimo.get("/api/conta", headers=com_token(entrar())).json()["id"])
    vencido, _ = criar_token_sessao(
        usuario_id, configuracao(), agora=datetime.now(UTC) - timedelta(days=91)
    )
    assert anonimo.get("/api/sync", headers=com_token(vencido)).status_code == 401


def test_token_assinado_com_outro_segredo_e_recusado(anonimo: TestClient, entrar: Entrar) -> None:
    usuario_id = anonimo.get("/api/conta", headers=com_token(entrar())).json()["id"]
    agora = datetime.now(UTC)
    falso = jwt.encode(
        {"sub": usuario_id, "iat": agora, "exp": agora + timedelta(days=1)},
        "outro-segredo-com-pelo-menos-32-caracteres",
        algorithm="HS256",
    )
    assert anonimo.get("/api/sync", headers=com_token(falso)).status_code == 401


def test_id_token_do_google_nao_serve_como_sessao(
    anonimo: TestClient, entrar: Entrar, id_token_google: GerarIdToken
) -> None:
    entrar()
    assert anonimo.get("/api/sync", headers=com_token(id_token_google())).status_code == 401


def test_token_de_usuario_inexistente_e_recusado(anonimo: TestClient) -> None:
    token, _ = criar_token_sessao(uuid.uuid4(), configuracao())
    assert anonimo.get("/api/sync", headers=com_token(token)).status_code == 401


def test_email_tirado_da_lista_perde_o_acesso(
    anonimo: TestClient,
    entrar: Entrar,
    id_token_google: GerarIdToken,
    convidar: Callable[[str], None],
) -> None:
    token = entrar()
    assert anonimo.get("/api/sync", headers=com_token(token)).status_code == 200

    convidar(EMAIL_B)
    # O token continua válido, mas o acesso foi removido: nem sync, nem novo login.
    assert anonimo.get("/api/sync", headers=com_token(token)).status_code == 403
    assert anonimo.post("/api/sync", headers=com_token(token), json={}).status_code == 403
    login = anonimo.post("/api/auth/google", json={"id_token": id_token_google()})
    assert login.status_code == 403

    convidar(f"{EMAIL_A},{EMAIL_B}")
    assert anonimo.get("/api/sync", headers=com_token(token)).status_code == 200


# --- Fichas modelo no primeiro login --------------------------------------------------------


def catalogo_com_modelo() -> Catalogo:
    return Catalogo.model_validate(
        {
            "exercicios": [
                {"slug": "supino", "nome": "Supino reto", "grupo_muscular": "Peito"},
                {"slug": "supino-maquina", "nome": "Supino máquina", "grupo_muscular": "Peito"},
                {"slug": "triceps-corda", "nome": "Tríceps corda", "grupo_muscular": "Tríceps"},
            ],
            "fichas": [
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
                            "alternativas": ["supino-maquina"],
                        },
                        {
                            "exercicio": "triceps-corda",
                            "series": 3,
                            "alvo_reps": 12,
                            "grupo_biset": 1,
                        },
                    ],
                }
            ],
        }
    )


def test_primeiro_login_copia_as_fichas_modelo(
    session: Session, entrar: Entrar, anonimo: TestClient
) -> None:
    carregar_catalogo(session, catalogo_com_modelo())

    pacote_a = anonimo.get("/api/sync", headers=com_token(entrar())).json()
    assert [f["nome"] for f in pacote_a["fichas"]] == ["Push"]
    itens = sorted(pacote_a["ficha_exercicios"], key=lambda i: i["ordem"])
    assert [(i["series"], i["alvo_reps"]) for i in itens] == [(3, 8), (3, 12)]
    assert itens[0]["aquecimento"] is True
    assert len(itens[0]["alternativas"]) == 1
    assert itens[1]["grupo_biset"] == 1
    assert all(i["ficha_id"] == pacote_a["fichas"][0]["id"] for i in itens)
    # Os exercícios do catálogo vêm junto (as cópias apontam para eles).
    assert len(pacote_a["exercicios"]) == 3

    # O B recebe a própria cópia, com outros ids.
    pacote_b = anonimo.get("/api/sync", headers=com_token(entrar(EMAIL_B, "sub-bruno"))).json()
    assert len(pacote_b["fichas"]) == 1
    assert pacote_b["fichas"][0]["id"] != pacote_a["fichas"][0]["id"]


def test_segundo_login_nao_copia_de_novo(
    session: Session, entrar: Entrar, anonimo: TestClient
) -> None:
    carregar_catalogo(session, catalogo_com_modelo())
    entrar()
    token = entrar()
    assert len(anonimo.get("/api/sync", headers=com_token(token)).json()["fichas"]) == 1


# --- Login de desenvolvimento ---------------------------------------------------------------


def _com_login_dev(database_url: str = "sqlite://") -> None:
    from backend.config import get_settings

    config = configuracao().model_copy(update={"login_dev": True, "database_url": database_url})
    app.dependency_overrides[get_settings] = lambda: config


def test_login_dev_desligado_por_padrao(anonimo: TestClient) -> None:
    assert anonimo.get("/api/auth/config").json() == {
        "google_client_id": CLIENT_ID,
        "login_dev": False,
    }
    assert anonimo.post("/api/auth/dev", json={"email": EMAIL_A}).status_code == 404


def test_login_dev_local(anonimo: TestClient) -> None:
    _com_login_dev()
    assert anonimo.get("/api/auth/config").json()["login_dev"] is True
    resposta = anonimo.post("/api/auth/dev", json={"email": EMAIL_A, "nome": "Ana"})
    assert resposta.status_code == 200
    token = resposta.json()["token"]
    assert anonimo.get("/api/sync", headers=com_token(token)).status_code == 200
    # Continua exigindo convite.
    assert anonimo.post("/api/auth/dev", json={"email": "x@exemplo.com"}).status_code == 403


def test_login_dev_nunca_funciona_na_vercel(
    anonimo: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _com_login_dev()
    monkeypatch.setenv("VERCEL", "1")
    assert anonimo.get("/api/auth/config").json()["login_dev"] is False
    assert anonimo.post("/api/auth/dev", json={"email": EMAIL_A}).status_code == 404


def test_login_dev_nunca_funciona_com_postgres(anonimo: TestClient) -> None:
    _com_login_dev("postgresql://usuario:senha@exemplo.neon.tech/neondb")
    assert anonimo.post("/api/auth/dev", json={"email": EMAIL_A}).status_code == 404
