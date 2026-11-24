"""Fixtures dos testes.

O login com Google é testado de verdade, só que sem rede: os ID tokens são assinados com uma
chave RSA gerada aqui, e o verificador recebe a chave pública dela no lugar das do Google.
"""

import time
from collections.abc import Callable, Iterator
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel

from backend.auth import VerificadorGoogle, get_verificador_google
from backend.config import Settings, get_settings
from backend.db import criar_engine, get_session
from backend.main import app

CLIENT_ID = "cliente-de-teste.apps.googleusercontent.com"
SEGREDO = "segredo-de-teste-com-pelo-menos-32-caracteres"
EMAIL_A = "ana@exemplo.com"
EMAIL_B = "bruno@exemplo.com"

GerarIdToken = Callable[..., str]
Entrar = Callable[..., str]


@pytest.fixture(scope="session")
def chave_google() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def id_token_google(chave_google: rsa.RSAPrivateKey) -> GerarIdToken:
    """Gera um ID token como o do Google; passe campos para mudar ou `None` para tirar."""

    def gerar(chave: Any = None, **campos: Any) -> str:
        agora = int(time.time())
        dados: dict[str, Any] = {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "sub": "sub-ana",
            "email": EMAIL_A,
            "email_verified": True,
            "name": "Ana",
            "iat": agora,
            "exp": agora + 3600,
        }
        dados.update(campos)
        dados = {k: v for k, v in dados.items() if v is not None}
        return jwt.encode(dados, chave or chave_google, algorithm="RS256", headers={"kid": "teste"})

    return gerar


@pytest.fixture
def engine() -> Iterator[Engine]:
    engine = criar_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def configuracao(emails: str = f"{EMAIL_A},{EMAIL_B}") -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="sqlite://",
        google_client_id=CLIENT_ID,
        sessao_secret=SEGREDO,
        emails_permitidos=emails,
    )


@pytest.fixture
def convidar() -> Callable[[str], None]:
    """Troca a lista de convites (como mudar EMAILS_PERMITIDOS na Vercel)."""

    def trocar(emails: str) -> None:
        app.dependency_overrides[get_settings] = lambda: configuracao(emails)

    return trocar


@pytest.fixture
def anonimo(
    engine: Engine, chave_google: rsa.RSAPrivateKey, convidar: Callable[[str], None]
) -> Iterator[TestClient]:
    """Cliente sem login."""

    def _session() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    publica = chave_google.public_key()
    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_verificador_google] = lambda: VerificadorGoogle(
        CLIENT_ID, obter_chave=lambda _token: publica
    )
    convidar(f"{EMAIL_A},{EMAIL_B}")
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def entrar(anonimo: TestClient, id_token_google: GerarIdToken) -> Entrar:
    """Faz o login com Google e devolve o token de sessão."""

    def login(email: str = EMAIL_A, sub: str = "sub-ana", **campos: Any) -> str:
        resposta = anonimo.post(
            "/api/auth/google", json={"id_token": id_token_google(email=email, sub=sub, **campos)}
        )
        assert resposta.status_code == 200, resposta.text
        return resposta.json()["token"]

    return login


def _cliente_logado(token: str) -> TestClient:
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


@pytest.fixture
def client(entrar: Entrar) -> TestClient:
    """Cliente logado como a Ana (usuária A)."""
    return _cliente_logado(entrar(EMAIL_A, "sub-ana"))


@pytest.fixture
def client_b(entrar: Entrar) -> TestClient:
    """Cliente logado como o Bruno (usuário B)."""
    return _cliente_logado(entrar(EMAIL_B, "sub-bruno", name="Bruno"))
