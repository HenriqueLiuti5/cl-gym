"""Dados de exemplo usados nos testes de sincronização."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

T0 = datetime(2026, 11, 3, 18, 0, tzinfo=UTC)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def novo_id() -> str:
    return str(uuid.uuid4())


def exercicio(id_: str, quando: datetime = T0, **extra: Any) -> dict[str, Any]:
    return {
        "id": id_,
        "atualizado_em": iso(quando),
        "nome": "Supino reto com barra",
        "grupo_muscular": "Peito",
        **extra,
    }


def treino_completo() -> tuple[dict[str, Any], dict[str, str]]:
    ids = {nome: novo_id() for nome in ("ex", "ficha", "item", "sessao", "serie", "dia", "meta")}
    corpo = {
        "exercicios": [exercicio(ids["ex"])],
        "fichas": [{"id": ids["ficha"], "atualizado_em": iso(T0), "nome": "Peito e Tríceps"}],
        "ficha_exercicios": [
            {
                "id": ids["item"],
                "atualizado_em": iso(T0),
                "ficha_id": ids["ficha"],
                "exercicio_id": ids["ex"],
                "series": 3,
                "alvo_reps": 8,
                "aquecimento": True,
            }
        ],
        "sessoes": [
            {
                "id": ids["sessao"],
                "atualizado_em": iso(T0),
                "ficha_id": ids["ficha"],
                "iniciada_em": iso(T0),
                "finalizada_em": iso(T0 + timedelta(hours=1)),
            }
        ],
        "series": [
            {
                "id": ids["serie"],
                "atualizado_em": iso(T0),
                "sessao_id": ids["sessao"],
                "exercicio_id": ids["ex"],
                "ficha_exercicio_id": ids["item"],
                "numero": 1,
                "carga_kg": 32.5,
                "repeticoes": 10,
            }
        ],
        "registros_diarios": [
            {
                "id": ids["dia"],
                "atualizado_em": iso(T0),
                "data": "2026-11-03",
                "peso_kg": 80.5,
                "kcal": 2300,
                "proteina_g": 150,
                "carbo_g": 220.5,
                "agua_ml": 2750,
                "observacao": "Basquete",
            }
        ],
        "metas": [
            {
                "id": ids["meta"],
                "atualizado_em": iso(T0),
                "tipo": "carga",
                "exercicio_id": ids["ex"],
                "valor": 40,
                "inicio": 32.5,
            }
        ],
    }
    return corpo, ids


TABELAS = (
    "exercicios",
    "fichas",
    "ficha_exercicios",
    "sessoes",
    "series",
    "registros_diarios",
    "metas",
)


def pacote_vazio(pacote: dict[str, Any]) -> bool:
    return all(pacote[t] == [] for t in TABELAS)
