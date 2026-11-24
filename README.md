# CL Gym

[![CI](https://github.com/HenriqueLiuti5/cl-gym/actions/workflows/ci.yml/badge.svg)](https://github.com/HenriqueLiuti5/cl-gym/actions/workflows/ci.yml)

A workout tracker for a small group of friends: training plans, loads, a "Plan B" for busy
machines, progression hints, daily weight and nutrition totals, and charts. It is a **PWA**
installed from the browser on Android and iPhone, and it is built **offline-first**: the app never
waits for the server, because gym signal is bad. Everything is written to the phone first and
synced in the background.

The whole stack runs on free tiers (Vercel Hobby, Neon Free, Google sign-in without billing), with
no app store and no paid APIs.

Built with AI assistance (Claude Code), as described in [`CLAUDE.md`](CLAUDE.md).

## Stack

- **Backend:** Python 3.12 · FastAPI · SQLModel · Alembic · PostgreSQL (SQLite in development and
  tests) · PyJWT · pytest · ruff · uv
- **Frontend:** React · TypeScript · Vite · Tailwind · `vite-plugin-pwa` · Dexie (IndexedDB) ·
  Recharts · Vitest
- **CI:** GitHub Actions (lint, types, tests and build for both sides)

## What the app does

- **Sign in with Google**, invite-only (an e-mail allow list). Each person only ever sees their own
  data; on first sign-in they get a copy of the template plans, which they can then edit.
- **Plans** with one rep target per exercise (never a range), a warm-up flag on the first exercise,
  supersets, and up to two alternatives per exercise ("Plan B"). Every exercise keeps its own load
  history, including the alternatives.
- **Logging a workout** works with no connection. Each exercise shows what was done last time, and
  the app says "go up in weight" when the first set beat the target by 2 reps, or "too heavy" when a
  set fell 2 reps short.
- **Suggestion of the day:** the plan done longest ago, since workouts do not follow weekdays.
- **Daily log:** fasting weight, calories, protein and a note. Charts show load progression per
  exercise, a 7-day weight average and weekly calories and protein against personal goals.
- **Profile and account:** the first sign-in asks for name, current weight, height and age (the
  weight goes into the daily log, so the weight chart starts right away). All of it, plus the
  goals, can be changed later, and deleting the account erases everything for real behind a
  typed confirmation.

## Sync protocol

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
- **When.** On app open (or on returning to it after five minutes away), a couple of seconds after
  saving anything outside a workout, when a workout ends and when the connection comes back. Sets
  logged during a workout go up together at the end. Never on a timer, to stay within free-tier
  limits, and with no connection the app does not even try.
- **Auth.** `POST /api/auth/google` verifies the Google ID token (signature, audience,
  `email_verified`) against the invite list and returns a long-lived session token signed by the
  server, so the app keeps working after days offline. Every route except `/api/health` requires
  `Authorization: Bearer <session token>`.
- **Per-user data.** The server stamps every record with the user from the token. Downloads only
  return that user's records plus the shared exercise catalog; changing someone else's record (or
  the catalog) is refused with **403**, and pointing to it counts as missing (**409**).

The server side lives in [`backend/sync.py`](backend/sync.py) (tests in
[`test_sync.py`](backend/tests/test_sync.py) and
[`test_isolamento.py`](backend/tests/test_isolamento.py)); the client side in
[`frontend/src/lib/sync.ts`](frontend/src/lib/sync.ts).

## Running locally

Requires git, [uv](https://docs.astral.sh/uv/) and Node 22 (pinned in [`.nvmrc`](.nvmrc)). uv
downloads Python 3.12 by itself.

```bash
git clone https://github.com/HenriqueLiuti5/cl-gym.git && cd cl-gym
uv run scripts/preparar.py         # one-time setup; safe to rerun after a pull
```

The [setup script](scripts/preparar.py) is plain Python, so it is the same command on Linux,
macOS and Windows. It creates a development `.env` from [`.env.example`](.env.example) (with a
fresh session secret and the dev login enabled), migrates and seeds the local SQLite database with
the exercise catalog and template plans, and installs the frontend with `npm ci`. It never
overwrites an existing `.env` and never touches a non-SQLite database.

Then run the API and the app in two terminals:

```bash
uv run uvicorn backend.main:app --reload    # http://localhost:8000/api/docs
npm --prefix frontend run dev               # http://localhost:5173, proxies /api to the backend
```

The sign-in screen offers a development login (any e-mail from `EMAILS_PERMITIDOS`), so you do
not need a Google client ID locally. It only works with SQLite and outside Vercel; in production
the route answers 404.

Checks (the same ones CI runs):

```bash
uv run pytest
uv run ruff check . && uv run ruff format --check .
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

## Status

- [x] Multi-user backend: Google sign-in, invites, per-user sync, profile and account deletion
- [x] Training model: rep targets, warm-up, supersets, Plan B, daily log and goals
- [x] Template plans and exercise images (public-domain
  [free-exercise-db](https://github.com/yuhonas/free-exercise-db))
- [x] Offline-first PWA
- [ ] Deploy (Vercel + Neon) and invites
