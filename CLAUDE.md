# CL Gym

App pessoal de treinos de academia do Henrique (um único usuário). Ele usa no celular Android
como PWA instalada. Tudo precisa rodar **de graça**.

## Git e commits

- **Commite sempre como se fosse o Henrique.** O autor é o do `git config` dele. Não adicione
  `Co-Authored-By`, "Generated with Claude Code" nem qualquer menção ao Claude em commits,
  descrições de PR ou comentários.
- Mensagens de commit em português, no imperativo e curtas (ex.: "Adiciona registro de carga").
- Repositório privado: `github.com/HenriqueLiuti5/cl-gym`, branch `main`.

## Stack

| Parte | Tecnologia |
|---|---|
| Backend | FastAPI + SQLModel + Alembic, Python 3.12, gerenciado com `uv` |
| Banco | SQLite em desenvolvimento/testes · Postgres no **Neon** (plano grátis) em produção |
| Frontend (a fazer) | Vite + React + TypeScript + Tailwind, PWA (`vite-plugin-pwa`), Dexie (IndexedDB), Recharts |
| Hospedagem | **Vercel** (plano Hobby): frontend estático + FastAPI como função Python em `api/index.py` |

## Comandos

```bash
uv sync                                   # instala dependências
uv run alembic upgrade head               # cria/atualiza o banco local (clgym.db)
uv run python -m backend.seed             # carrega backend/data/treino.toml no banco
uv run uvicorn backend.main:app --reload  # API em http://localhost:8000 (docs em /api/docs)
uv run pytest                             # testes
uv run ruff check . && uv run ruff format .
uv run alembic revision --autogenerate -m "descrição"   # depois de mudar models.py
```

Configuração via `.env` (veja `.env.example`): `DATABASE_URL` e `APP_TOKEN`.

## Estrutura

```
api/index.py            entrada da Vercel (importa backend.main:app)
backend/
  main.py               app FastAPI (/api/health, rotas)
  config.py             Settings (DATABASE_URL, APP_TOKEN)
  db.py                 engine, sessão, tipo UTCDateTime
  auth.py               token Bearer único
  models.py             tabelas + esquemas de sincronização
  sync.py               lógica de envio/download
  routers/sync.py       GET/POST /api/sync
  seed.py               carrega o catálogo do TOML
  data/treino.toml      exercícios, substitutos e fichas do Henrique
  migrations/           Alembic
  tests/
frontend/               (a criar) app React
vercel.json             rewrite /api/* → função Python
```

## Arquitetura: offline-first

Na academia o sinal pode ser ruim e o plano grátis pode ter partida a frio, então **o app nunca
espera o servidor**. O frontend grava tudo no IndexedDB (Dexie) e sincroniza em segundo plano. O
backend é a cópia na nuvem (backup e troca de aparelho), não a fonte das telas.

### Protocolo de sincronização

- Todo registro tem `id` (UUID **gerado no app**), `atualizado_em` (com fuso), `excluido`
  (exclusão lógica, nunca apagar de verdade) e `versao` (definida pelo servidor).
- `POST /api/sync`: o app envia `{exercicios, fichas, ficha_exercicios, sessoes, series}` com o
  que mudou localmente. **Vence o `atualizado_em` mais recente**; registro igual ou mais antigo é
  ignorado (reenviar é seguro). O envio é atômico: uma referência inválida devolve 409 e nada é
  gravado.
- `GET /api/sync?desde=<cursor>`: devolve o que mudou depois do cursor e o novo `cursor`. O app
  guarda o cursor. Se `desde` for maior que o cursor do servidor (banco recriado), volta tudo.
- Ciclo do app: enviar pendentes → baixar desde o último cursor → salvar o cursor.
- Todas as rotas exceto `/api/health` exigem `Authorization: Bearer <APP_TOKEN>`.

## Modelo de dados

- **Exercicio**: nome, grupo_muscular, imagens (URLs), instrucoes (passos em PT), midia_url (GIF
  ou vídeo escolhido no app) e `substituto_id`, **um** exercício que trabalha exatamente o mesmo
  músculo, para quando o aparelho estiver ocupado.
- **Ficha**: treino nomeado (Peito e Tríceps, Costas e Bíceps, Perna, Upper) e `ordem`.
- **FichaExercicio**: exercício planejado na ficha, com ordem, series, repeticoes (texto: "8-12",
  "até a falha") e observacao.
- **Sessao**: um treino feito (ficha_id, iniciada_em, finalizada_em).
- **Serie**: uma série registrada (sessao_id, exercicio_id **realmente feito**,
  ficha_exercicio_id planejado, numero, carga_kg, repeticoes). Cada exercício, inclusive o
  substituto, tem o próprio histórico de carga.

## Regras de negócio (implementar no frontend, sobre os dados locais)

- **Os treinos não seguem dia da semana.** O Henrique falta e muda o descanso; ele escolhe a
  ficha que quiser.
- **Sugestão do dia**: destacar a ficha feita **há mais tempo** (nunca feita vem primeiro;
  desempate por `ordem`). É só sugestão, todas as fichas continuam selecionáveis.
- **Última vez**: para cada exercício, mostrar carga × reps da sessão mais recente em que ele foi
  feito.
- **Trocar**: alterna entre o exercício planejado e o seu substituto; a série é gravada com o
  `exercicio_id` do que foi feito.
- **Gráfico de evolução**: por exercício, a maior `carga_kg` de cada sessão ao longo do tempo.
- Sem timer de descanso na primeira versão.

## Catálogo (seed)

`backend/data/treino.toml` é a fonte dos exercícios e das fichas. IDs = `uuid5` do slug, então
rodar o seed de novo só regrava o que mudou (com versão nova, para os celulares baixarem). Não
mude slugs em uso, porque o histórico está ligado a eles. Demonstrações: imagens da base de domínio
público **free-exercise-db** e um link para busca no YouTube. Não copie GIFs com direitos autorais
para o repositório.

## Deploy (a fazer)

1. Criar o banco no Neon e usar a URL **pooled** (`-pooler`) como `DATABASE_URL` na Vercel.
2. Definir `APP_TOKEN` na Vercel.
3. Rodar as migrações e o seed no Neon a partir da máquina local:
   `DATABASE_URL="..." uv run alembic upgrade head && DATABASE_URL="..." uv run python -m backend.seed`.
4. Validar no primeiro deploy como a Vercel instala as dependências Python (pyproject/uv.lock ou
   `requirements.txt` via `uv export`) e o `vercel.json`.

## Status

- [x] Backend: modelos, migrações, sincronização, autenticação, seed e testes
- [ ] Treino detalhado do Henrique no `treino.toml` (ele vai enviar) + substitutos + imagens
- [ ] Frontend PWA
- [ ] Deploy Vercel + Neon e instalação no celular
