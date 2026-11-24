from fastapi.testclient import TestClient


def test_health_nao_exige_token(anonimo: TestClient) -> None:
    resposta = anonimo.get("/api/health")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok"}


def test_docs_disponiveis(anonimo: TestClient) -> None:
    assert anonimo.get("/api/openapi.json").status_code == 200
