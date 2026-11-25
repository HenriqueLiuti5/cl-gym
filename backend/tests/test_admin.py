"""Área de administração: só a conta do ADMIN_EMAIL (a Ana) entra. Lista as pessoas (só
atividade), bloqueia, desbloqueia, apaga contas e gera convites."""

import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from backend.convites import ALFABETO
from backend.main import app
from backend.models import Convite, Usuario
from backend.tests.conftest import EMAIL_B, Entrar, GerarIdToken, NovoConvite
from backend.tests.dados import T0, iso, novo_id, treino_completo
from backend.tests.test_auth import com_token
from backend.tests.test_conta import registros_do_usuario

CAMPOS_USUARIO = {
    "id",
    "nome",
    "email",
    "criado_em",
    "visto_em",
    "aparelho",
    "instalado",
    "bloqueado",
    "bloqueado_em",
    "admin",
    "treinos",
    "treinos_30d",
    "ultimo_treino",
}
IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari"
ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131 Mobile"


def id_de(client: TestClient) -> str:
    return client.get("/api/conta").json()["id"]


def do_usuario(lista: list[dict[str, Any]], usuario_id: str) -> dict[str, Any]:
    return next(u for u in lista if u["id"] == usuario_id)


def recarregar(session: Session, usuario_id: str) -> Usuario:
    session.expire_all()
    usuario = session.get(Usuario, uuid.UUID(usuario_id))
    assert usuario is not None
    return usuario


# --- Acesso ---------------------------------------------------------------------------------

ROTAS = [
    ("GET", "/api/admin/usuarios"),
    ("POST", "/api/admin/usuarios/{id}/bloquear"),
    ("POST", "/api/admin/usuarios/{id}/desbloquear"),
    ("DELETE", "/api/admin/usuarios/{id}"),
    ("GET", "/api/admin/convites"),
    ("POST", "/api/admin/convites"),
    ("POST", "/api/admin/convites/{id}/cancelar"),
]


@pytest.mark.parametrize(("metodo", "rota"), ROTAS)
def test_so_o_admin_entra(
    anonimo: TestClient, client_b: TestClient, metodo: str, rota: str
) -> None:
    caminho = rota.format(id=uuid.uuid4())
    assert anonimo.request(metodo, caminho).status_code == 401
    resposta = client_b.request(metodo, caminho)
    assert resposta.status_code == 403
    assert "administrador" in resposta.json()["detail"]
    assert "X-Motivo" not in resposta.headers  # não é bloqueio: o app não sai da conta


# --- Lista de usuários ----------------------------------------------------------------------


def test_lista_so_atividade_com_as_contagens(client: TestClient, client_b: TestClient) -> None:
    agora = datetime.now(UTC)
    corpo, _ = treino_completo()  # tem peso, alimentação, metas e cargas
    client_b.post("/api/sync", json=corpo)

    def sessao(fim: datetime | None, excluido: bool = False) -> dict[str, Any]:
        inicio = (fim or agora) - timedelta(hours=1)
        return {
            "id": novo_id(),
            "atualizado_em": iso(agora),
            "iniciada_em": iso(inicio),
            "finalizada_em": iso(fim) if fim else None,
            "excluido": excluido,
        }

    cinco_dias = agora - timedelta(days=5)
    client_b.post(
        "/api/sync",
        json={
            "sessoes": [
                sessao(agora - timedelta(days=40)),
                sessao(cinco_dias),
                sessao(None),  # em andamento: não conta
                sessao(agora - timedelta(days=2), excluido=True),  # apagada: não conta
            ]
        },
    )

    resposta = client.get("/api/admin/usuarios")
    assert resposta.status_code == 200
    lista = resposta.json()
    assert all(set(u) == CAMPOS_USUARIO for u in lista)
    # Nada de saúde nem de treino além das contagens.
    for proibido in ("peso", "kcal", "proteina", "carbo", "agua", "altura", "idade", "carga"):
        assert proibido not in resposta.text

    ana = do_usuario(lista, id_de(client))
    assert (ana["admin"], ana["treinos"], ana["ultimo_treino"]) == (True, 0, None)
    bruno = do_usuario(lista, id_de(client_b))
    assert bruno["admin"] is False
    assert bruno["bloqueado"] is False
    # O do treino_completo também conta (terminou em T0 + 1 h).
    recente = T0 + timedelta(hours=1) >= agora - timedelta(days=30)
    assert (bruno["treinos"], bruno["treinos_30d"]) == (3, 1 + recente)
    ultimo = datetime.fromisoformat(bruno["ultimo_treino"])
    assert abs(ultimo - cinco_dias) < timedelta(seconds=1)


def test_lista_os_vistos_mais_recentes_primeiro(
    client: TestClient, client_b: TestClient, entrar: Entrar, session: Session
) -> None:
    id_b = id_de(client_b)
    id_c = id_de(TestClient(app, headers=com_token(entrar("carla@exemplo.com", "sub-carla"))))
    session.expire_all()
    bruno = session.get(Usuario, uuid.UUID(id_b))
    carla = session.get(Usuario, uuid.UUID(id_c))
    assert bruno is not None and carla is not None
    bruno.visto_em = datetime.now(UTC) - timedelta(days=1)
    carla.visto_em = None  # nunca vista: vai para o fim
    session.commit()

    ids = [u["id"] for u in client.get("/api/admin/usuarios").json()]
    assert ids == [id_de(client), id_b, id_c]


# --- Bloquear -------------------------------------------------------------------------------


def test_bloquear_tira_o_acesso_e_desbloquear_devolve(
    client: TestClient,
    client_b: TestClient,
    anonimo: TestClient,
    id_token_google: GerarIdToken,
    session: Session,
) -> None:
    id_b = id_de(client_b)
    client_b.post("/api/sync", json=treino_completo()[0])

    bloqueado = client.post(f"/api/admin/usuarios/{id_b}/bloquear")
    assert bloqueado.status_code == 200
    assert bloqueado.json()["bloqueado"] is True
    assert bloqueado.json()["bloqueado_em"] is not None

    for resposta in (
        client_b.get("/api/sync"),
        client_b.post("/api/sync", json={}),
        client_b.get("/api/conta"),
    ):
        assert resposta.status_code == 403
        assert resposta.headers["X-Motivo"] == "bloqueado"
        assert "bloqueado" in resposta.json()["detail"]
    login = anonimo.post(
        "/api/auth/google", json={"id_token": id_token_google(email=EMAIL_B, sub="sub-bruno")}
    )
    assert (login.status_code, login.headers["X-Motivo"]) == (403, "bloqueado")
    # Os dados continuam lá.
    assert registros_do_usuario(session, uuid.UUID(id_b)) == 7

    # Bloquear de novo não muda a data.
    de_novo = client.post(f"/api/admin/usuarios/{id_b}/bloquear").json()
    assert de_novo["bloqueado_em"] == bloqueado.json()["bloqueado_em"]

    livre = client.post(f"/api/admin/usuarios/{id_b}/desbloquear")
    assert (livre.status_code, livre.json()["bloqueado"]) == (200, False)
    assert client_b.get("/api/sync").status_code == 200


def test_admin_nao_bloqueia_nem_apaga_a_si_mesmo(client: TestClient, session: Session) -> None:
    id_a = id_de(client)
    bloquear = client.post(f"/api/admin/usuarios/{id_a}/bloquear")
    assert bloquear.status_code == 400
    assert "própria conta" in bloquear.json()["detail"]
    apagar = client.delete(f"/api/admin/usuarios/{id_a}")
    assert apagar.status_code == 400
    assert "Apagar minha conta" in apagar.json()["detail"]
    assert recarregar(session, id_a).bloqueado_em is None


def test_admin_nunca_fica_bloqueado(client: TestClient, session: Session) -> None:
    # Mesmo marcado como bloqueado no banco (ex.: virou admin depois), o admin continua entrando.
    recarregar(session, id_de(client)).bloqueado_em = datetime.now(UTC)
    session.commit()
    assert client.get("/api/admin/usuarios").status_code == 200


@pytest.mark.parametrize("acao", ["bloquear", "desbloquear"])
def test_bloquear_quem_nao_existe(client: TestClient, acao: str) -> None:
    assert client.post(f"/api/admin/usuarios/{uuid.uuid4()}/{acao}").status_code == 404


# --- Apagar ---------------------------------------------------------------------------------


def test_apagar_conta_de_outra_pessoa(
    client: TestClient, client_b: TestClient, session: Session
) -> None:
    id_b = id_de(client_b)
    client_b.post("/api/sync", json=treino_completo()[0])
    assert registros_do_usuario(session, uuid.UUID(id_b)) == 7

    assert client.delete(f"/api/admin/usuarios/{id_b}").status_code == 204

    assert registros_do_usuario(session, uuid.UUID(id_b)) == 0
    assert session.get(Usuario, uuid.UUID(id_b)) is None
    resposta = client_b.get("/api/sync")
    assert (resposta.status_code, resposta.headers["X-Motivo"]) == (401, "conta-apagada")
    # O convite que o Bruno usou fica no histórico, sem apontar para a conta apagada.
    session.expire_all()
    usado = session.exec(select(Convite)).one()
    assert (usado.usado_em is not None, usado.usado_por) == (True, None)
    convite = client.get("/api/admin/convites").json()[0]
    assert (convite["situacao"], convite["usado_por"]) == ("usado", None)
    assert id_b not in [u["id"] for u in client.get("/api/admin/usuarios").json()]
    assert client.delete(f"/api/admin/usuarios/{id_b}").status_code == 404


# --- Atividade ------------------------------------------------------------------------------


def test_atividade_visto_aparelho_e_app_instalado(
    anonimo: TestClient, entrar: Entrar, session: Session
) -> None:
    token = entrar(EMAIL_B, "sub-bruno")
    id_b = anonimo.get("/api/conta", headers=com_token(token)).json()["id"]
    bruno = recarregar(session, id_b)
    # O login marca: o TestClient se apresenta como "testclient" (um computador).
    visto = bruno.visto_em
    assert visto is not None
    assert (bruno.aparelho, bruno.instalado) == ("Computador", False)

    def chamar(**headers: str) -> Usuario:
        anonimo.get("/api/conta", headers={**com_token(token), **headers})
        return recarregar(session, id_b)

    # Menos de 60 s depois: o visto não é regravado, mas aparelho e instalado mudam na hora.
    bruno = chamar(**{"User-Agent": IPHONE, "X-App-Instalado": "1"})
    assert (bruno.visto_em, bruno.aparelho, bruno.instalado) == (visto, "iPhone", True)
    # Sem o cabeçalho, o instalado fica como estava.
    assert chamar(**{"User-Agent": IPHONE}).instalado is True

    bruno.visto_em = datetime.now(UTC) - timedelta(seconds=61)
    session.commit()
    bruno = chamar(**{"User-Agent": ANDROID, "X-App-Instalado": "0"})
    assert bruno.visto_em is not None
    assert bruno.visto_em > visto
    assert (bruno.aparelho, bruno.instalado) == ("Android", False)


def test_aparelho_pelo_user_agent() -> None:
    from backend.atividade import aparelho_do_user_agent

    assert aparelho_do_user_agent(IPHONE) == "iPhone"
    assert aparelho_do_user_agent("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)") == "iPad"
    assert aparelho_do_user_agent(ANDROID) == "Android"
    assert aparelho_do_user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)") == "Computador"
    assert aparelho_do_user_agent(None) is None


# --- Convites -------------------------------------------------------------------------------

PADRAO_CODIGO = re.compile(rf"^[{ALFABETO}]{{4}}-[{ALFABETO}]{{4}}$")


def test_gerar_listar_e_cancelar_convite(client: TestClient) -> None:
    criado = client.post("/api/admin/convites")
    assert criado.status_code == 201
    convite = criado.json()
    assert PADRAO_CODIGO.match(convite["codigo"])
    assert convite["situacao"] == "valido"
    validade = datetime.fromisoformat(convite["expira_em"]) - datetime.fromisoformat(
        convite["criado_em"]
    )
    assert validade == timedelta(hours=24)
    assert client.get("/api/admin/convites").json() == [convite]

    cancelado = client.post(f"/api/admin/convites/{convite['id']}/cancelar")
    assert cancelado.status_code == 200
    assert (cancelado.json()["situacao"], cancelado.json()["codigo"]) == ("cancelado", None)
    assert cancelado.json()["cancelado_em"] is not None
    assert client.post(f"/api/admin/convites/{convite['id']}/cancelar").status_code == 409
    assert client.post(f"/api/admin/convites/{uuid.uuid4()}/cancelar").status_code == 404


def test_convite_do_admin_cria_a_conta_de_quem_recebeu(
    client: TestClient, anonimo: TestClient, id_token_google: GerarIdToken
) -> None:
    codigo = client.post("/api/admin/convites").json()["codigo"]
    resposta = anonimo.post(
        "/api/auth/google",
        json={
            "id_token": id_token_google(email="carla@exemplo.com", sub="sub-carla", name="Carla"),
            "convite": codigo,
        },
    )
    assert resposta.status_code == 200
    carla = resposta.json()["usuario"]

    convite = client.get("/api/admin/convites").json()[0]
    assert (convite["situacao"], convite["codigo"]) == ("usado", None)
    assert convite["usado_por"] == {"id": carla["id"], "nome": "Carla", "email": carla["email"]}


def test_lista_os_validos_e_os_ultimos_30_dias(
    client: TestClient, novo_convite: NovoConvite
) -> None:
    agora = datetime.now(UTC)
    antigo = agora - timedelta(days=40)
    novo_convite(criado_em=antigo, expira_em=antigo + timedelta(hours=24))  # some
    novo_convite(criado_em=antigo, expira_em=agora + timedelta(hours=1))  # ainda vale: fica
    novo_convite(expira_em=agora - timedelta(minutes=1))  # expirou hoje: fica, sem código
    lista = client.get("/api/admin/convites").json()
    assert sorted(c["situacao"] for c in lista) == ["expirado", "valido"]
    assert next(c for c in lista if c["situacao"] == "expirado")["codigo"] is None
    # Os mais novos primeiro.
    assert lista[0]["situacao"] == "expirado"
