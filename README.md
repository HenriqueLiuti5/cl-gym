# CL Gym

App pessoal para acompanhar meus treinos de academia: fichas, cargas, exercícios substitutos e
evolução. Funciona offline no celular (PWA) e sincroniza com uma API FastAPI.

## Rodando o backend

Precisa do [uv](https://docs.astral.sh/uv/).

```bash
uv sync
cp .env.example .env        # e gere um APP_TOKEN
uv run alembic upgrade head
uv run python -m backend.seed
uv run uvicorn backend.main:app --reload
```

A documentação interativa fica em http://localhost:8000/api/docs. Clique em **Authorize** e
informe o `APP_TOKEN`.

Testes: `uv run pytest`
