"""Fixtures dos testes.

O login com Google é testado de verdade, só que sem rede: os ID tokens são assinados com uma
chave RSA gerada aqui, e o verificador recebe a chave pública dela no lugar das do Google.

A Ana (EMAIL_A) é a administradora (ADMIN_EMAIL) e cria a conta sem convite; o Bruno (EMAIL_B) e
os outros criam a conta com um convite gerado aqui, como se o admin tivesse mandado.
"""

import time
from collections.abc import Callable, Iterator
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, select

from backend.auth import VerificadorGoogle, get_verificador_google
from backend.config import Settings, get_settings
from backend.convites import criar_convite
from backend.db import criar_engine, get_session
from backend.main import app
from backend.models import Usuario

CLIENT_ID = "cliente-de-teste.apps.googleusercontent.com"
SEGREDO = "segredo-de-teste-com-pelo-menos-32-caracteres"
EMAIL_A = "ana@exemplo.com"
EMAIL_B = "bruno@exemplo.com"

GerarIdToken = Callable[..., str]
Entrar = Callable[..., str]
NovoConvite = Callable[..., str]
Configurar = Callable[..., None]


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


def configuracao(admin: str = EMAIL_A) -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="sqlite://",
        google_client_id=CLIENT_ID,
        sessao_secret=SEGREDO,
        admin_email=admin,
    )


@pytest.fixture
def configurar() -> Configurar:
    """Troca a configuração do servidor (como mudar as variáveis na Vercel)."""

    def trocar(**campos: Any) -> None:
        config = configuracao().model_copy(update=campos)
        app.dependency_overrides[get_settings] = lambda: config

    return trocar


@pytest.fixture
def novo_convite(engine: Engine) -> NovoConvite:
    """Cria um convite direto no banco (como o admin pela tela) e devolve o código. Passe campos
    para mudar (ex.: `expira_em` no passado)."""

    def criar(**mudancas: Any) -> str:
        with Session(engine) as session:
            convite = criar_convite(session)
            for campo, valor in mudancas.items():
                setattr(convite, campo, valor)
            session.commit()
            return convite.codigo

    return criar


def tem_conta(engine: Engine, sub: str) -> bool:
    with Session(engine) as session:
        return session.exec(select(Usuario).where(Usuario.google_sub == sub)).first() is not None


@pytest.fixture
def anonimo(
    engine: Engine, chave_google: rsa.RSAPrivateKey, configurar: Configurar
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
    configurar()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def entrar(
    anonimo: TestClient, id_token_google: GerarIdToken, engine: Engine, novo_convite: NovoConvite
) -> Entrar:
    """Faz o login com Google e devolve o token de sessão. Quem não é o admin e ainda não tem
    conta entra com um convite novo."""

    def login(email: str = EMAIL_A, sub: str = "sub-ana", **campos: Any) -> str:
        corpo = {"id_token": id_token_google(email=email, sub=sub, **campos)}
        config: Settings = app.dependency_overrides[get_settings]()
        if not config.e_admin(email) and not tem_conta(engine, sub):
            corpo["convite"] = novo_convite()
        resposta = anonimo.post("/api/auth/google", json=corpo)
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
