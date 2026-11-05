from fastapi.testclient import TestClient


def test_health_nao_exige_token(client: TestClient) -> None:
    resposta = client.get("/api/health", headers={"Authorization": ""})
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok"}


def test_sync_sem_token_e_recusado(client: TestClient) -> None:
    resposta = client.get("/api/sync", headers={"Authorization": ""})
    assert resposta.status_code == 401


def test_sync_com_token_errado_e_recusado(client: TestClient) -> None:
    resposta = client.get("/api/sync", headers={"Authorization": "Bearer token-errado-123456789"})
    assert resposta.status_code == 401


def test_docs_disponiveis(client: TestClient) -> None:
    assert client.get("/api/openapi.json").status_code == 200
