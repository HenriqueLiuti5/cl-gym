# CL Gym

[![CI](https://github.com/HenriqueLiuti5/cl-gym/actions/workflows/ci.yml/badge.svg)](https://github.com/HenriqueLiuti5/cl-gym/actions/workflows/ci.yml)

A personal workout tracker: training plans, loads, substitute exercises and progress over time.
It is built **offline-first**: the phone app (a PWA, still to be built) never waits for the
server, and this FastAPI backend is the cloud copy it syncs with in the background, for backup and
for switching phones.

Built with AI assistance (Claude Code), as described in [`CLAUDE.md`](CLAUDE.md).

## Stack

Python 3.12 · FastAPI · SQLModel · Alembic · PostgreSQL (SQLite in development and tests) ·
pytest · ruff · uv · GitHub Actions

## Sync protocol

The gym often has poor signal, so the app writes everything to local storage first and syncs
when it can. The backend makes that safe:

- **Client-generated IDs.** Every record has a UUID created on the phone, an `updated_at`
  timestamp with time zone, a soft-delete flag and a `version` assigned by the server.
- **Upload (`POST /api/sync`).** The app sends what changed locally. The latest `updated_at`
  wins, and a record that is equal or older is ignored, so resending is always safe. The batch is
  atomic: if any record points to one that does not exist, the API answers **409** and nothing is
  written.
- **Download (`GET /api/sync?desde=<cursor>`).** Returns everything changed after the cursor,
  plus the new cursor. The server reads the cursor *before* the records, so an upload still in
  progress is never skipped; it simply arrives in the next download. If the client's cursor is
  ahead of the server's (a recreated database), it gets everything again.
- **Auth.** Every route except `/api/health` requires `Authorization: Bearer <APP_TOKEN>`,
  compared in constant time.

The logic lives in [`backend/sync.py`](backend/sync.py) and is covered by
[`backend/tests/test_sync.py`](backend/tests/test_sync.py).

## Running locally

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync
cp .env.example .env               # then generate an APP_TOKEN
uv run alembic upgrade head
uv run python -m backend.seed      # loads the exercise catalog
uv run uvicorn backend.main:app --reload
```

Interactive docs: http://localhost:8000/api/docs (click **Authorize** and paste the `APP_TOKEN`).

```bash
uv run pytest                      # 31 tests
uv run ruff check . && uv run ruff format --check .
```

## Status

- [x] Backend: models, migrations, sync, authentication, seed and tests
- [x] CI on GitHub Actions
- [ ] PWA frontend (React, Vite, IndexedDB)
- [ ] Deploy (Vercel + Neon)
