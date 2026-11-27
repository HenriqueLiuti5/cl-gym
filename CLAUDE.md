# CL Gym

App de treinos de academia do Henrique **e dos amigos dele** (decidido em 24/11/2026; antes era
de um usuário só). Cada um usa no celular (Android ou iPhone) como PWA instalada pelo navegador.

**Duas regras que valem para tudo:**
1. **Os amigos vão usar.** Login simples, dados separados por pessoa, fácil de instalar.
2. **Custo total de R$ 0.** Nenhuma decisão pode depender de algo pago. Veja "Custo zero".

O plano completo está em "Plano multiusuário (v1 para os amigos)", mais abaixo.

## Git e commits

- O autor dos commits é o do `git config` do Henrique. O projeto é feito com o Claude Code, e
  isso não se esconde: commits feitos com ele podem levar a linha `Co-Authored-By` do Claude.
- Mensagens de commit em português, no imperativo e curtas (ex.: "Adiciona registro de carga").
- Repositório público: `github.com/HenriqueLiuti5/cl-gym`, branch `main`. O README é em inglês,
  porque é peça de portfólio; o resto (código, comentários, este arquivo) segue em português.
- A CI (`.github/workflows/ci.yml`) roda `ruff check`, `ruff format --check` e `pytest` a cada push.

## Stack

| Parte | Tecnologia |
|---|---|
| Backend | FastAPI + SQLModel + Alembic, Python 3.12, gerenciado com `uv` |
| Banco | SQLite em desenvolvimento/testes · Postgres no **Neon** (plano grátis) em produção |
| Frontend (`frontend/`) | Vite + React + TypeScript + Tailwind, PWA (`vite-plugin-pwa`), Dexie (IndexedDB), Recharts, Vitest. Node 22. O Henrique não faz questão da stack; ficou esta por ser a mais fácil de publicar na Vercel (detecta o Vite sozinha) e por o PWA offline sair pronto com o plugin |
| Hospedagem | **Vercel** (plano Hobby): frontend estático + FastAPI como função Python em `api/index.py`, no mesmo projeto e no mesmo endereço (`cl-gym.vercel.app` e `/api`) |
| Login | **Entrar com Google** (Google Identity Services), verificado no backend |

## Computador novo

Precisa de `git`, [uv](https://docs.astral.sh/uv/) e Node 22 (a versão fica no `.nvmrc`; com
nvm/fnm, `nvm use`). O Python 3.12 o `uv` baixa sozinho. Depois:

```bash
git clone https://github.com/HenriqueLiuti5/cl-gym.git && cd cl-gym
uv run scripts/preparar.py     # .env de dev, banco, seed e npm ci; pode repetir após um git pull
```

O script cria o `.env` só se ele não existir (com `SESSAO_SECRET` nova e `LOGIN_DEV=1`) e só mexe
em banco SQLite. É Python puro para rodar igual em Linux, macOS e Windows; o `.gitattributes`
mantém tudo em LF também no Windows. O VS Code sugere as extensões de `.vscode/extensions.json`.

**O que não vem no clone** (fica só em cada máquina): o `.env`, o banco `clgym.db`, o
`CLAUDE.local.md` (copie de `CLAUDE.local.example.md` e aponte para o vault), o
`.claude/settings.local.json` e a memória do Claude Code. Por isso, **o que precisa valer em
todos os computadores vai neste arquivo**, não na memória.

## Comandos

```bash
uv run scripts/preparar.py                # computador novo (veja acima)
uv sync                                   # instala dependências
uv run alembic upgrade head               # cria/atualiza o banco local (clgym.db)
uv run python -m backend.seed             # carrega backend/data/treino.toml no banco
uv run python -m backend.dados_dev        # meses de dados na conta de dev + amigos e convites de exemplo
uv run uvicorn backend.main:app --reload  # API em http://localhost:8000 (docs em /api/docs)
uv run pytest                             # testes
uv run ruff check . && uv run ruff format .
uv run alembic revision --autogenerate -m "descrição"   # depois de mudar models.py
uv run scripts/icones.py                  # refaz os ícones de frontend/public a partir da logo
```

No SQLite as migrações rodam com as chaves estrangeiras desligadas (o modo batch recria a tabela
para tirar ou mudar coluna, e apagar uma tabela referenciada falharia) e conferem tudo com
`PRAGMA foreign_key_check` no fim (`backend/migrations/env.py`).

O `backend.dados_dev` só roda em SQLite: gera 20 semanas inventadas (treinos com progressão e
Plano B, peso caindo, calorias, proteína, carbo, água e metas, uma delas já alcançada) na conta do
"Entrar como dev" (o `ADMIN_EMAIL`), e uns amigos de exemplo (um bloqueado) e convites, para a tela
de administração. Pode rodar de novo; não mexe no que foi lançado à mão.

```bash
cd frontend
npm ci                                    # dependências do app, exatas do package-lock.json
npm run dev                               # app em http://localhost:5173 (/api vai para a :8000)
npm run lint && npm run typecheck && npm test
npm run build                             # gera frontend/dist com o service worker
```

Para testar o app sem um `GOOGLE_CLIENT_ID` de verdade, ponha `LOGIN_DEV=1` no `.env`: a tela de
login mostra "Entrar como dev" (com o `ADMIN_EMAIL`, uma conta que já existe ou um código de
convite, como no login de verdade). Isso só funciona com banco
SQLite e fora da Vercel (`VERCEL` no ambiente); em produção `/api/auth/dev` responde 404. O
`.claude/launch.json` tem os servidores `api` e `app` para o painel de navegador do Claude Code.

Configuração via `.env` (veja `.env.example`): `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `SESSAO_SECRET`
(mínimo 32 caracteres), `ADMIN_EMAIL` (o e-mail do administrador) e, opcional, `SESSAO_DIAS`
(padrão 90) e `LOGIN_DEV` (só local). As migrações e o seed só precisam do `DATABASE_URL`.

## Estrutura

```
api/index.py            entrada da Vercel (importa backend.main:app)
backend/
  main.py               app FastAPI (/api/health, rotas)
  config.py             Settings (banco, Google, sessão, convites)
  db.py                 engine, sessão, tipos UTCDateTime e ListaUUID
  auth.py               verificação do ID token do Google, token de sessão, usuário atual
  conta.py              criar a conta (sem fichas) e apagar conta
  models.py             tabelas + esquemas de sincronização
  sync.py               lógica de envio/download, separada por usuário
  routers/auth.py       GET /api/auth/config, POST /api/auth/google, POST /api/auth/dev (só local)
  routers/conta.py      GET/PATCH/DELETE /api/conta (perfil; apagar a conta)
  convites.py           código do convite (gerar, normalizar, situação) e o uso na criação da conta
  routers/convites.py   GET /api/convites/{id} e POST /api/convites/verificar (sem login)
  routers/admin.py      /api/admin/usuarios e /api/admin/convites (só o ADMIN_EMAIL)
  routers/sync.py       GET/POST /api/sync
  routers/modelos.py    GET /api/modelos (fichas modelo, para "Usar um modelo pronto")
  seed.py               carrega o catálogo do TOML
  dados_dev.py          dados inventados para a conta de dev (só SQLite)
  data/treino.toml      exercícios do catálogo (com substitutos) e fichas modelo
  migrations/           Alembic
  tests/                conftest (login simulado, sem rede), dados de exemplo e testes
scripts/preparar.py     prepara um computador novo (.env de dev, banco, seed, npm ci)
scripts/icones.py       gera os ícones do app a partir da logo (pillow, via `uv run`)
frontend/
  index.html, vite.config.ts   PWA (manifest, service worker, cache das imagens), proxy de /api
  marca/logo.png               logo oficial (emblema CL, 2048 px), fonte dos ícones; não é publicada
  public/                      ícones (saem da marca/logo.png com scripts/icones.py)
  src/index.css                cores do tema claro e do escuro (variáveis), estilos de base
  src/main.tsx, App.tsx        entrada, rotas por hash (#/treino/<id>) e abas de baixo
  src/lib/db.ts                banco local (Dexie): espelho das tabelas + `pendente`
  src/lib/sync.ts              envia pendentes, baixa desde o cursor, guarda o cursor; gatilhos automáticos
  src/lib/regras.ts            última vez, avisos de progressão, treinos feitos, datas
  src/lib/fichas.ts            criar e editar treino: rascunho, limites, o que gravar, Plano B
                               sugerido, busca e grupos do seletor de exercício
  src/lib/modelos.ts           copiar um modelo pronto, lista "Seus treinos", resumo do treino
  src/lib/treino.ts            começar, finalizar e cancelar o treino; gravar e apagar a série
  src/lib/linhaSerie.ts        linha da série: ler kg e reps, limites, eco da própria gravação
  src/lib/troca.ts             opções de "Trocar" (ficha, Plano B e parecidos)
  src/lib/metas.ts             metas: limites, salvar offline, progresso, "na meta", parabéns
  src/lib/estatisticas.ts      números da Evolução (treinos, recordes, peso, alimentação, escala)
  src/lib/curiosidades.ts      curiosidades com comparações (elefantes, Pão de Açúcar, ovos...)
  src/lib/perfil.ts            perfil (primeiro acesso e Conta): limites, altura, peso atual
  src/lib/ids.ts               UUID v4 e v5 (ids do registro do dia e das metas), sem https
  src/lib/api.ts, sessao.ts    chamadas à API, token, login (Google e dev, com convite), sair
  src/lib/convite.ts           código do convite (normalizar, formatar, link)
  src/lib/convitePendente.ts   convite já conferido, esperando o login (localStorage)
  src/lib/admin.ts             API e contas da área de administração
  src/lib/instalar.ts          instalar o app: pedido nativo do Chrome, plataforma, instalado
  src/lib/navegacao.ts         ordem das telas ao arrastar o dedo e o lado de cada transição
  src/telas/                   Login, Convite, BoasVindas, Inicio, FichaTela, EditarFicha,
                               Treino, Dia, Graficos, Conta, Admin
  src/componentes/EscolherExercicio.tsx  seletor de exercício da edição (adicionar, Plano B,
                               criar exercício próprio)
  src/componentes/ModelosProntos.tsx     janela "Modelos prontos"
  src/componentes/TrocarExercicio.tsx    janela "Trocar" do treino em andamento
  src/componentes/Palco.tsx    área das telas: arrastar troca de aba, voltar pela borda, transições
  src/componentes/Entrada.tsx  peças do login e do convite: logo, botão do Google, código, login dev
  src/componentes/admin/       Usuários e Convites da administração
  src/componentes/Instalar.tsx botão e linha "Instalar o app" (com as instruções do iPhone)
  src/componentes/ui.tsx       peças de tela: botão, lista agrupada, linha com campo, segmentos,
                               aviso, janela (Modal) e Confirmar
  src/componentes/icones.tsx   ícones em SVG (traço simples, desenhados no projeto)
  src/componentes/evolucao/    abas da Evolução, gráfico com meta, seletor de exercício, cores
vercel.json             build do frontend + rewrite /api/* → função Python
.nvmrc                  versão do Node (usada também pela CI)
.vscode/                extensões recomendadas e ruff ao salvar (o resto da pasta é ignorado)
CLAUDE.local.example.md modelo do CLAUDE.local.md (caminho do vault e regras de privacidade)
```

## Arquitetura: offline-first

Na academia o sinal pode ser ruim e o plano grátis pode ter partida a frio, então **o app nunca
espera o servidor**. O frontend grava tudo no IndexedDB (Dexie) e sincroniza em segundo plano. O
backend é a cópia na nuvem (backup e troca de aparelho), não a fonte das telas.

### Protocolo de sincronização

- Todo registro tem `id` (UUID **gerado no app**), `atualizado_em` (com fuso), `excluido`
  (exclusão lógica, nunca apagar de verdade) e `versao` (definida pelo servidor).
- `POST /api/sync`: o app envia `{exercicios, fichas, ficha_exercicios, sessoes, series,
  registros_diarios, metas}` com o que mudou localmente. **Vence o `atualizado_em` mais recente**; registro igual ou mais antigo é
  ignorado (reenviar é seguro). O envio é atômico: uma referência inválida devolve 409 e nada é
  gravado.
- `GET /api/sync?desde=<cursor>`: devolve o que mudou depois do cursor e o novo `cursor`. O app
  guarda o cursor. Se `desde` for maior que o cursor do servidor (banco recriado), volta tudo.
- Ciclo do app: enviar pendentes → baixar desde o último cursor → salvar o cursor. No download,
  uma mudança local ainda pendente e mais nova que a do servidor é mantida.
- **Quando sincroniza (automático):** ao abrir o app e ao voltar para ele depois de 5 min ou mais
  em segundo plano; uns 2 s depois de salvar algo fora do treino (registro do dia, perfil, metas,
  criar, editar ou apagar um treino, copiar um modelo, criar um exercício, cancelar treino),
  juntando mudanças seguidas (`sincronizarEmBreve`); ao terminar um
  treino; quando a internet volta (evento `online`); e no botão "Sincronizar" da tela Conta. As
  séries do treino em andamento não disparam sincronização: vão juntas no fim. Se o app for para
  segundo plano com uma sincronização agendada, ela sai na hora. Nunca em intervalo fixo. Uma
  chamada no meio de outra sincronização roda de novo no fim, para levar o que mudou.
- **Sem internet** (`navigator.onLine` falso) o app nem tenta e não mostra aviso: tudo fica no
  celular até a próxima vez. A faixa no topo só aparece em erro de verdade.
- Erro 5xx ou falta de rede contam como "sem internet": tudo fica no celular. 401 pede login de
  novo sem apagar os dados locais; o mesmo para 403 com `X-Motivo: bloqueado` (conta bloqueada
  pelo admin), e a tela de login explica o motivo (`X-Motivo: conta-apagada` no 401 de conta que
  não existe mais). O app valida os mesmos limites do servidor (ex.: carga até
  1000 kg), porque um registro recusado (422) travaria os envios seguintes.
- Todas as rotas exceto `/api/health`, as de login (`/api/auth/*`) e as públicas do convite
  (`GET /api/convites/{id}` e `POST /api/convites/verificar`) exigem `Authorization: Bearer <token
  de sessão>`. O envio e o download só enxergam os registros do usuário (veja abaixo).
- **Isolamento:** o servidor grava o `usuario_id` do token (ignora o que vier do app). O download
  traz os registros do usuário e os exercícios do catálogo. No envio, alterar registro de outro
  usuário ou do catálogo dá **403**, e apontar para ele conta como inexistente (**409**, com a
  mesma mensagem de "não existe"). Nos dois casos nada é gravado.
- **RegistroDiario:** só um por usuário e data, então o app deve gerar o `id` de forma
  determinística (ex.: UUID v5 de `usuario_id` + data), igual em todos os aparelhos. Dois ids
  diferentes para a mesma data dão 409.

## Modelo de dados

Registros sincronizáveis têm `id`, `atualizado_em`, `excluido` e `versao` (veja acima) e
`usuario_id`, definido pelo servidor. Com `usuario_id` nulo, exercícios e fichas são do catálogo.

- **Usuario** (não sincroniza; `GET/PATCH /api/conta`): `id`, `google_sub` (único), `email`,
  `criado_em` e o perfil, todo opcional: `nome` (vem do Google no primeiro login; depois é a
  pessoa quem muda, e o login não troca mais), `altura_cm` (50–250) e `idade` (10–120). O peso
  atual não fica aqui (veja "Perfil"), nem as metas (tabela `Meta`, que sincroniza e funciona
  offline). Atividade, só para a administração: `visto_em` (última chamada autenticada, gravada
  no máximo a cada 60 s), `aparelho` (iPhone, iPad, Android ou Computador, pelo User-Agent),
  `instalado` (cabeçalho `X-App-Instalado` do app) e `bloqueado_em`.
- **Convite** (não sincroniza): `codigo` (8 caracteres de `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, sem
  0/O e 1/I/L, único; mostrado como `XXXX-XXXX`), `criado_em`, `expira_em` (24 h), `usado_em`,
  `usado_por` e `cancelado_em`. Situação: cancelado, usado, expirado ou válido.
- **Exercicio**: nome, grupo_muscular, imagens (URLs), instrucoes (passos em PT), midia_url (GIF
  ou vídeo) e `substitutos` (até 5 `exercicio_id` parecidos, do mais parecido ao menos, sem
  repetir e sem o próprio; padrão `[]`). Os do catálogo vêm do seed e só o seed altera; cada um
  pode criar os seus (no app, sem imagens nem substitutos). É o único download que traz
  `usuario_id` (nulo = catálogo, só leitura no app).
- **Ficha**: treino nomeado e `ordem` (só a ordem de exibição). As do catálogo são **modelos
  prontos**: não vêm na sincronização; o app os pede em `GET /api/modelos` e, quando a pessoa
  escolhe um, copia localmente com ids novos e envia a cópia pela sincronização normal (por isso
  não existe rota de cópia).
- **FichaExercicio**: exercício planejado na ficha, com `ordem`, `series`, `alvo_reps` (int),
  `aquecimento` (bool), `alternativas` (lista ordenada de até 2 `exercicio_id`, o Plano B) e
  `observacao` (dicas de execução). `grupo_biset` (int ou nulo) continua no banco e na
  sincronização porque versões antigas do app mandam o campo, mas o app não usa mais o bi-set
  (26/11/2026): itens novos gravam nulo, e a edição não mexe no valor dos que já existem.
- **Sessao**: um treino feito (ficha_id, iniciada_em, finalizada_em, observacao).
- **Serie**: uma série registrada (sessao_id, exercicio_id **realmente feito**,
  ficha_exercicio_id planejado, numero, carga_kg, repeticoes). Cada exercício, inclusive as
  alternativas, tem o próprio histórico de carga.
- **RegistroDiario**: um por usuário e `data`, com `peso_kg` (em jejum), `kcal`, `proteina_g`,
  `carbo_g`, `agua_ml` e `observacao`, todos opcionais.
- **Meta**: `tipo` (`peso`, `carga`, `kcal`, `proteina`, `carbo`, `agua` em ml, `treinos_semana`),
  `valor`, `exercicio_id` (só e sempre nas de carga) e `inicio` (peso ou recorde quando a meta foi
  definida: dá o sentido e o progresso). Limites por tipo em `LIMITES_META` (`models.py`, igual em
  `lib/metas.ts`). Uma por tipo, e uma por exercício nas de carga (índices únicos parciais): o app
  gera o `id` como UUID v5 de usuário + tipo + exercício, igual em todos os aparelhos; dois ids
  para a mesma meta dão 409.

## Regras de negócio (implementar no frontend, sobre os dados locais)

- **Os treinos não seguem dia da semana.** O Henrique falta e muda o descanso; ele escolhe a
  ficha que quiser.
- **Tela de treinos** (sem sugestão do dia desde 26/11/2026): "Seus treinos" na `ordem`, cada um
  com "N exercícios · M séries" e quando foi feito ("há 3 dias", "nunca feito"), e sempre "Criar
  treino" e "Usar um modelo pronto". Conta sem fichas vê um cartão com os dois botões; num
  aparelho que ainda não sincronizou (sem `cursor`), "Buscando seus treinos…" no lugar dele.
- **Criar e editar treinos** (`#/editar/nova` e `#/editar/<id>`, pedido em 26/11/2026): o
  rascunho fica em memória e só grava em "Salvar", numa transação, regravando só os itens que
  mudaram. Exercício novo entra com 3 × 10, aquecimento só se for o primeiro e o Plano B sugerido
  com os 2 primeiros `substitutos`. O seletor busca sem acento, mostra os grupos na ordem do
  catálogo (`ORDEM_GRUPOS` em `lib/fichas.ts`, a mesma do `treino.toml`) e, no Plano B, os
  parecidos primeiro. "Criar exercício" grava um exercício próprio. Apagar o treino é exclusão
  lógica da ficha e dos itens; as sessões ficam para o histórico. Mudanças não salvas pedem
  confirmação ao voltar.
- **Modelos prontos:** copiar um modelo cria uma ficha da pessoa (ids novos, sem bi-set), que ela
  edita como qualquer outra. Ver a lista precisa de internet; a cópia, não.
- **Última vez**: para cada exercício, mostrar carga × reps da sessão mais recente em que ele foi
  feito.
- **Trocar**: abre a janela "Trocar exercício" com o planejado e o Plano B do item ("Na ficha") e
  os `substitutos` do planejado ("Parecidos"), cada um com a última carga feita; a série é
  gravada com o `exercicio_id` do que foi feito.
- **Gráfico de evolução**: por exercício, a maior `carga_kg` de cada sessão ao longo do tempo.
- **Evolução** (decidido em 24/11/2026: "muitas informações e curiosidades", gráficos fáceis de
  entender): abas Treino, Corpo, Nutrição e Curiosidades (`#/graficos/<aba>`). Cada gráfico diz o
  que mostra numa frase, tem "Ver os números" (tabela) e usa uma cor por assunto (validadas para
  contraste e daltonismo nos dois temas: valores em `src/index.css`, `--color-g-*`; nomes em
  `componentes/evolucao/cores.ts`). O exercício se escolhe numa lista própria com busca e grupos,
  **nunca o `<select>` do navegador**.
- **Metas nos gráficos:** a meta é um **alvo** desenhado (círculo com um ponto; ao chegar, círculo
  verde com um visto) num lugar extra "Meta" no fim do eixo (na linha, um tracejado liga o último
  valor até ele; nas barras, uma linha tracejada na altura da meta, e as barras fora da meta ficam
  apagadas). Peso (pela média de 7 dias) e carga (recorde) são
  **destinos**: mostram o caminho feito, quanto falta e, no peso, a previsão no ritmo atual; ao
  chegar, o app dá **parabéns e pergunta pela próxima meta** (com sugestão). A comemoração é
  guardada por aparelho (`metas_comemoradas`) e volta se a meta mudar. As do dia a dia não
  comemoram: "na meta" é ±10% em calorias e carbo, e chegar pelo menos nela em proteína, água e
  treinos por semana.
- **Registrar a série** (sem confirmar desde 26/11/2026): cada linha tem "Anterior" (carga ×
  reps da mesma série na última vez), kg (já vem com a carga sugerida) e reps (a dica é o alvo).
  Com os dois preenchidos e dentro dos limites, a série grava sozinha a cada tecla, sempre no
  mesmo registro, e fica anotada (número e visto em verde). Esvaziar um campo apaga a série ao
  sair dele. Valor fora do limite não grava e mostra o erro no campo. A linha reconhece o eco da
  própria gravação pela hora (`lib/linhaSerie.ts`), para não desfazer o que foi digitado depois.
  "Finalizar treino" pergunta antes se nenhuma série foi anotada.
- Sem timer de descanso na primeira versão.
- **Perfil (primeiro acesso):** enquanto faltar nome, altura ou idade, o app abre a tela de
  boas-vindas pedindo nome, peso, altura e idade antes de qualquer outra. O **peso atual** é o
  último `peso_kg` do RegistroDiario: o peso digitado ali (ou na Conta) entra no registro de hoje,
  que funciona offline e já aparece no gráfico. Nome, altura e idade vão por `PATCH /api/conta` e
  precisam de internet; sem ela, o primeiro acesso oferece "Preencher depois" e pergunta de novo
  na próxima abertura. A altura aceita metros ("1,78" vira 178 cm).

## Design

Decidido em 24/11/2026: **simples, profissional e sem cara de IA**, pensado para o celular.

- **Sem emojis** em nenhum lugar (abas, avisos, metas, curiosidades). Ícone é SVG de
  `componentes/icones.tsx`; o que não tem ícone vira texto ou etiqueta ("Aquecimento", "Bi-set").
- **Sem neon, gradiente, brilho ou vidro.** Fundo cinza-claro, cartões brancos, um acento azul
  sóbrio para o que é tocável (botão principal, links, aba ativa). Verde, âmbar e vermelho só para
  estado (feito/sobe o peso, pesado demais, apagar), sempre com ícone e texto.
- **Fonte do sistema** (San Francisco no iPhone, Roboto no Android). Nada de fonte baixada.
  Corpo de 15–17 px; campos com 17 px, porque abaixo de 16 px o iPhone dá zoom ao tocar.
- **Tema claro e escuro, seguindo o celular.** As cores ficam só em `src/index.css`, como
  variáveis (`bg-superficie`, `text-texto-2`, `text-acento`...); a paleta padrão do Tailwind está
  desligada. Todo texto passa de 4,5:1 de contraste nos dois temas. No iPhone, a barra de status
  usa `default` e o `theme-color` acompanha o tema.
- **Padrões de celular:** título grande nas abas, barra fixa com voltar nas telas internas, listas
  agrupadas (estilo ajustes), campos em linha com a unidade ao lado, seletor de segmentos no lugar
  de abas de texto. Confirmação é a janela `Confirmar` do app, nunca o `confirm()` do navegador.
- **Gestos de app** (pedido em 25/11/2026): arrastar o dedo para o lado troca de aba, com a tela
  seguindo o dedo, na ordem Treinos → Dia → Evolução (Treino → Corpo → Nutrição → Curiosidades) →
  Conta, como abas de cima dentro das de baixo no Android; na Administração, entre Usuários e
  Convites. O arrasto não começa em gráficos (`data-sem-arrasto`: lá ele mostra os valores),
  campos, janelas, listas que rolam para o lado e na barra de abas, e nunca vira toque. No app
  instalado, arrastar da borda esquerda numa tela interna volta (vai para o link `data-voltar` da
  `BarraTopo`), porque o iPhone instalado não tem esse gesto. A edição do treino é interna, no
  nível do treino em andamento, e o voltar dela pergunta antes de descartar mudanças não
  salvas. Toda troca de tela desliza do lado
  certo, e "reduzir movimento" desliga as animações. Ordem em `lib/navegacao.ts`, gesto em
  `componentes/Palco.tsx`, animações no `index.css` ("Troca de tela").
- **Troca de tela suave** (pedido em 25/11/2026): ao soltar o arrasto, a tela e a nova andam
  juntas o que falta, como páginas, na velocidade do dedo, sem o pulo da folga no começo.
  Usa a View Transitions API: o navegador fotografa a tela de antes e a de depois e anima as
  duas fotos fora da thread principal. Por isso a rota troca de forma síncrona (`flushSync`, em
  `lib/rota.ts`), e o Palco espera os dados do IndexedDB chegarem antes da foto. A barra de abas
  (`data-abas`) fica parada e, na troca de parte, também o topo (`data-fixo-na-troca`). Onde a
  API não existe (iPhone antes do iOS 18), a tela sai e a nova entra com animações comuns.
  Listas que rolam para o lado não mostram a barra de rolagem (`sem-barra-de-rolagem`).
- **Barra de navegação do Android** (25/11/2026): o manifest **não tem `theme_color`** (no
  `vite.config.ts` ele é `undefined`; apagar a linha faz o plugin pôr o verde padrão dele). Com
  ele, o Chrome 156+ pinta a barra de baixo do app instalado com essa cor fixa, e no tema escuro
  ficava uma faixa clara. Sem ele, a barra segue o tema do celular, e a de status segue as `<meta
  theme-color>` do `index.html`. O aviso do plugin no build ("will not be able to be installed")
  está desatualizado. A tela de abertura é preta (`background_color`), como o fundo da logo.
- **Logo e ícone do app** (decidido em 25/11/2026): o emblema CL em preto e branco de
  `frontend/marca/logo.png`, a imagem do Henrique ampliada e limpa. É a única exceção à regra de
  brilho e gradiente: não redesenhar nem colorir. Os PNGs de `public/` saem dela com
  `uv run scripts/icones.py`, em fundo preto e quadrado inteiro (o sistema aplica a máscara); no
  maskable o desenho fica dentro da área segura. A tela de login mostra o `logo-1024.png` sobre um topo preto.

## Catálogo (seed)

`backend/data/treino.toml` é a fonte dos exercícios do catálogo e das fichas modelo (formato
explicado no próprio arquivo). IDs = `uuid5` do slug, então
rodar o seed de novo só regrava o que mudou (com versão nova, para os celulares baixarem). Não
mude slugs em uso, porque o histórico está ligado a eles. Demonstrações: imagens da base de domínio
público **free-exercise-db** e um link para busca no YouTube. Não copie GIFs com direitos autorais
para o repositório.

Base completa desde 26/11/2026: 282 exercícios, todos com as duas imagens e com `substitutos` (de
2 a 4, salvo cadeira abdutora e monster walk, que só têm um ao outro), agrupados no arquivo por
grupo muscular na ordem de `ORDEM_GRUPOS` (`frontend/src/lib/fichas.ts`): Peito, Ombro, Tríceps,
Costas, Trapézio, Bíceps, Antebraço, Posterior de ombro, Quadríceps, Posterior de coxa, Glúteo,
Panturrilha, Adutores, Abdutores, Abdômen e Lombar. Um grupo novo precisa entrar nos dois lugares.
Ficaram de fora alongamentos, cardio, pliometria, olímpicos e strongman. Exercício novo não reusa a
pasta de imagens de outro. O seed recusa substituto que não existe, repetido ou o próprio.

## Plano multiusuário (v1 para os amigos)

Decidido com o Henrique em 24/11/2026. Ainda não existe nada em produção, então o esquema pode
mudar à vontade (nova migração, sem migrar dados).

### Login e convites
- **Entrar com Google.** O frontend usa o Google Identity Services e recebe um *ID token*. O
  backend (`POST /api/auth/google`) confere a assinatura, o `aud` (= `GOOGLE_CLIENT_ID`) e o
  `email_verified`. Não tem senha nem envio de e-mail.
- Aprovado, o backend cria (ou acha) o **Usuario** pelo `sub` do Google e devolve um **token de
  sessão próprio**, assinado com `SESSAO_SECRET`, de longa duração (uns 90 dias). Ele fica no
  aparelho e permite usar e sincronizar sem pedir o Google de novo, inclusive depois de ficar
  offline.
- **Só entra convidado** (decidido em 25/11/2026, no lugar da lista `EMAILS_PERMITIDOS`): entra
  quem já tem conta, o `ADMIN_EMAIL` (cria a conta sem convite) ou quem traz um **código de
  convite** válido. O convite é gerado pelo admin no app, vale **24 h** e para **uma pessoa**
  (qualquer uma que receber o link). A pessoa abre o link (`#/convite/<id>`), **digita o código**
  e entra com o Google; o convite é consumido na mesma transação que cria a conta. Sem o link
  (no app instalado do iPhone, que não enxerga o Safari), o código entra em "Tenho um convite" no
  login, por isso ele é longo o bastante para não ser adivinhado. Isso impede que estranhos
  gastem o limite grátis.
- Erros do login com motivo no cabeçalho `X-Motivo`: `sem-convite`, `convite-invalido` e
  `bloqueado`.

### Administração (decidido em 25/11/2026)
- Só para a conta do `ADMIN_EMAIL` (variável da Vercel; o e-mail não entra no repositório). No app,
  linha "Administração" no topo da aba Conta (`#/admin`), com Usuários e Convites. O servidor
  confere o admin em toda rota (`/api/admin/*`; outra conta recebe 403).
- **Usuários: só atividade**, nunca peso, alimentação, metas ou cargas: nome, e-mail, desde
  quando usa, visto por último ("ativo agora" = há menos de 10 min), aparelho e se instalou o
  app, treinos (total, últimos 30 dias e o último). Sem "treinando agora": exigiria sincronizar
  no início do treino, e a regra de sincronização ficou como está.
- **Bloquear** (reversível): a pessoa sai na próxima vez que o app falar com o servidor e não
  entra de novo; os dados ficam. **Excluir**: apaga tudo, como "Apagar minha conta" (confirmação
  digitando "apagar"). O admin não bloqueia nem exclui a si mesmo.
- **Convites:** gerar, enviar o link (compartilhar do celular) e o código, cancelar. O código fica
  visível para o admin até ser usado, expirar ou ser cancelado.

### Dados por usuário
- Nova tabela **Usuario**: `id`, `google_sub` (único), `email`, `nome`, `criado_em` e o perfil
  (`altura_cm`, `idade`), tudo opcional. As metas são a tabela sincronizável **Meta** (por
  usuário), para mudarem offline, inclusive na academia.
- **Todo registro pessoal tem `usuario_id`**: fichas, itens da ficha, sessões, séries, registro
  diário, metas e exercícios criados pelo usuário. O servidor **define o `usuario_id` a partir do token**
  e ignora o que vier do app.
- **Catálogo compartilhado:** exercícios com `usuario_id` nulo vêm do seed, todos baixam e
  ninguém edita. Cada um pode criar exercícios próprios.
- No envio, referência a registro de outro usuário conta como inexistente (409), e tentar alterar
  registro de outro usuário ou do catálogo é recusado.
- **Testes obrigatórios de isolamento:** o usuário A nunca baixa, altera nem referencia dados do B.

### Regras de treino (vêm do vault do Henrique e valem para todos)
- **Alvo de reps é um número só** (`alvo_reps: int`), nunca faixa tipo "8-12": ele se perde com
  faixas. Sai o campo `repeticoes` em texto.
- **Mesmo peso em todas as séries**, todas parando a 1–2 reps da falha. É normal as reps caírem
  entre as séries.
- **Progressão:** se a primeira série da última vez fez **alvo + 2** reps ou mais, o app mostra
  "sobe o peso". Se alguma série ficou **2 ou mais abaixo do alvo**, mostra "pesado demais".
- **Aquecimento:** `aquecimento: bool` no item da ficha (normalmente só o primeiro exercício).
  Mostra a etiqueta "Aquecimento" e "1×10 leve (uns 50% do peso)". Não conta como série.
- **Sem bi-set** (decidido em 26/11/2026): cada exercício fica no seu cartão, na ordem da ficha.
  O campo `grupo_biset` só existe por compatibilidade (veja "Modelo de dados").
- **Plano B com até 2 opções por item da ficha** (`alternativas`: lista ordenada de
  `exercicio_id`), no lugar do `substituto_id` único do exercício. A série é gravada com o
  exercício realmente feito, e cada um tem o próprio histórico.
- **Última vez** e **gráfico de evolução** continuam como estão em "Regras de negócio". A
  sugestão do dia saiu em 26/11/2026.
- **Contador de treinos feitos** (sessões finalizadas) na tela inicial.
- **Conta nova sem fichas** (decidido em 26/11/2026, no lugar da cópia no primeiro login): cada um
  cria os seus treinos ou copia um modelo pronto do `treino.toml` (o treino v2 do Henrique: Push,
  Pull, Leg day e Upper, com Plano B). Na publicação (27/11/2026), as cópias que os amigos
  tinham recebido foram apagadas no Neon (exclusão lógica; sessões e séries ficaram), e as do
  Henrique ficaram, só sem o bi-set.
  `copiar_fichas_modelo` (`backend/conta.py`) só serve ao `backend.dados_dev`.

### Peso e alimentação
- Tabela **RegistroDiario** (sincronizável, por usuário, uma por `data`): `peso_kg` (em jejum),
  `kcal`, `proteina_g`, `carbo_g`, `agua_ml` e `observacao` (ex.: jogo de basquete). Tudo
  opcional. A água é digitada em litros e tem botões de +250 ml, +500 ml e +1 L que já salvam.
- **Não conta comida dentro do app**: cada um usa o FatSecret (ou outro app grátis) e lança só o
  total do dia.
- Gráficos: média de 7 dias do peso (o alvo do Henrique é cair 0,2–0,4 kg por semana), variação
  semana a semana, e calorias, proteína, carbo e água por dia (14 dias) ou por semana, contra as
  metas; de onde vêm as calorias (proteína e carbo a 4 kcal/g).
- **Sem fotos do físico.** Decidido em 24/11/2026: não precisa.

### Privacidade
- O repositório é **público**: nunca commitar `.env`, dados reais ou qualquer coisa pessoal do
  vault (veja `CLAUDE.local.md`, que fica só na máquina; o modelo é `CLAUDE.local.example.md`).
- **Apagar minha conta** (`DELETE /api/conta`): apaga de verdade todos os registros do usuário
  (exceção à exclusão lógica). No app é um botão só, que abre um modal pedindo para digitar
  "apagar". Exportar em JSON saiu (decidido em 24/11/2026: não precisa).

### Custo zero
- **Nunca cadastrar cartão** na Vercel, no Neon nem no Google Cloud. Sem cartão nada é cobrado;
  se um limite estourar, o serviço para e o app segue funcionando offline.
- **Vercel Hobby:** só uso pessoal, não comercial. Não cobrar dos amigos nem pôr anúncio.
- **Neon Free:** 1 GB por projeto e 100 CU-horas por mês (confirmado em 24/11/2026). Passando de
  1 GB, as gravações falham, sem cobrança. Os dados são pequenos (uma série ≈ 200 bytes).
- **Google login:** projeto no Google Cloud **sem conta de faturamento**, tela de consentimento
  "Externo" e publicada em produção só com `openid`, `email` e `profile` (não exige verificação).
- **Sem loja de apps** (Play Store custa US$ 25 e App Store US$ 99/ano): é PWA. Sem domínio
  próprio: `cl-gym.vercel.app`.
- **Economia de processamento:** sincronizar só nos momentos de "Quando sincroniza" (abrir ou
  voltar ao app, logo depois de salvar fora do treino, fim do treino, internet de volta). As
  séries não sincronizam uma a uma. Nada de sincronizar em intervalos fixos.
- Nenhuma API paga (de comida, IA etc.).

### Instalação nos celulares
- O Henrique manda o link pelo WhatsApp.
- **Android (Chrome):** "Instalar app" ou menu ⋮ → "Adicionar à tela inicial".
- **iPhone:** tem que ser no **Safari**, botão de compartilhar → "Adicionar à Tela de Início".
- O app pede `navigator.storage.persist()`, porque o iPhone pode apagar os dados locais de sites
  pouco usados. A sincronização com o servidor é a garantia.
- **Botão "Instalar o app" antes de entrar** (decidido em 25/11/2026, no lugar de "sem tela de
  instalar"): nas telas de login e de convite, e numa linha da Conta quando aberto no navegador.
  Com o pedido nativo (`beforeinstallprompt`, Android e computador com Chrome), abre o do
  navegador; sem ele, mostra os passos (iPhone: Safari → Compartilhar → "Adicionar à Tela de
  Início"; Android: menu ⋮ → "Instalar app"). Some no app instalado.
- Atualização automática do service worker na próxima abertura com internet.

### Ordem de trabalho
1. **Backend multiusuário:** Usuario, `usuario_id` em tudo, login com Google e token de sessão,
   convites por e-mail, isolamento no sync, apagar conta. Testes de isolamento.
2. **Modelo novo do treino:** `alvo_reps`, `aquecimento`, `grupo_biset`, `alternativas`,
   RegistroDiario e metas. Nova migração.
3. **Seed das fichas modelo** a partir de `Treino/Push.md`, `Pull.md`, `Leg day.md` e `Upper.md` do
   vault (só nomes, séries, alvo, aquecimento, bi-set, Plano B e dicas de execução).
4. **Frontend PWA** (`frontend/`): login, fichas, registrar treino offline, última vez e avisos de
   progressão, registro diário, gráficos.
5. **Deploy** (abaixo) e convite dos amigos.
6. Atualizar o README (em inglês) para o app multiusuário.

### Depois da v1 (ideias, não fazer agora)
- Botão "copiar a semana" que gera um texto com os treinos, cargas, peso e kcal, para o Henrique
  colar no Claude e atualizar o vault.
- Timer de descanso.

## Deploy (feito em 25/11/2026)

No ar em `https://cl-gym.vercel.app`. A Vercel está ligada ao GitHub: cada push na `main` publica
sozinho. O banco é o projeto "CL GYM" do Neon (branch `production`, banco `neondb`).

Tudo em São Paulo: função da Vercel em `gru1` (`regions` no `vercel.json`; o Hobby aceita uma
região só) e banco do Neon em AWS `sa-east-1`. O Henrique faz os passos que pedem login nas contas
dele.

1. **Google Cloud** (feito): cliente OAuth "Aplicativo da Web", sem faturamento, com as origens
   `http://localhost`, `http://localhost:5173` e `https://cl-gym.vercel.app`. Se a Vercel der outro
   endereço ao projeto, acrescentar a origem nova lá.
2. **Variáveis de produção** ficam no `.env.producao` da máquina do Henrique (fora do Git; o
   `.gitignore` ignora `.env.*` menos o `.env.example`): `DATABASE_URL` (Neon, URL **pooled**, com
   `-pooler` no host), `GOOGLE_CLIENT_ID`, `SESSAO_SECRET` (própria da produção, diferente da de
   dev) e `ADMIN_EMAIL`. Na Vercel, cola-se o arquivo inteiro em Environment Variables.
   Nunca definir `LOGIN_DEV` na Vercel (lá ele já não funciona, mas não precisa estar). Como todo
   `.env`, ele não vem no clone: em outro computador, copie-o por um meio privado (nunca pelo Git)
   ou pegue a URL direta no painel do Neon (Connect) só para rodar as migrações.
3. **Migrações e seed no Neon**, da máquina local, pela URL **direta** (a mesma sem `-pooler`: o
   PgBouncer do pooler atrapalha DDL). Nunca imprimir a URL, que tem a senha:
   ```bash
   URL=$(uv run python -c "from dotenv import dotenv_values as d; print(d('.env.producao')['DATABASE_URL'].replace('-pooler', ''))")
   DATABASE_URL="$URL" uv run alembic upgrade head && DATABASE_URL="$URL" uv run python -m backend.seed
   ```
4. **Vercel**: importar o repositório do GitHub com o nome `cl-gym`. O `vercel.json` força o preset
   `vite` (sem isso, a detecção de FastAPI pelo `pyproject.toml` pode tomar o projeto todo e as
   funções de `api/` deixam de existir), define o build do frontend, o rewrite de `/api` e tira do
   pacote da função o que ela não usa (`excludeFiles`: o Python não tem tree-shaking). As
   dependências Python saem do `pyproject.toml` + `uv.lock` (a Vercel instala com uv).
5. Conferir `https://cl-gym.vercel.app/api/health` e `/api/auth/config`, entrar com o Google e
   convidar os amigos pela Administração (link + código, sem redeploy).
6. Mudança de banco: rodar a migração no Neon (passo 3) **antes** do push que a usa, porque cada
   push na `main` publica sozinho. As migrações são aditivas, então o código antigo segue
   funcionando com o banco já migrado. Em 25/11/2026, um push sem a migração deixou o login e a
   sincronização da produção dando 500 (a rota pública `GET /api/convites/<uuid qualquer>`
   responde 404 com o banco certo e 500 sem a tabela nova: serve para conferir).

## Status

- [x] Backend de um usuário: modelos, migrações, sincronização, autenticação, seed e testes
- [x] Plano multiusuário e custo zero decidido (24/11/2026)
- [x] Backend multiusuário + login com Google + convites, isolamento, apagar conta
- [x] Modelo novo do treino (alvo, aquecimento, bi-set, Plano B duplo, registro diário, metas)
- [x] Fichas modelo no `treino.toml` (treino v2 do vault) + imagens
- [x] Frontend PWA (login, treino offline, última vez, progressão, registro do dia, gráficos,
  metas e apagar conta)
- [x] Primeiro acesso com perfil (nome, peso, altura, idade) e tela Conta revista (24/11/2026)
- [x] Evolução com abas, metas (alvo no gráfico e parabéns), curiosidades, carbo e água, e dados
  de exemplo para a conta de dev (24/11/2026)
- [x] Redesenho: visual simples e profissional, sem emojis, tema claro e escuro (24/11/2026)
- [x] Deploy na Vercel (função em `gru1`) + Neon em São Paulo, migrações e seed (25/11/2026)
- [x] Administração (usuários com atividade, bloquear, excluir) e convites por link + código no
  lugar do `EMAILS_PERMITIDOS`; botão de instalar antes de entrar (25/11/2026)
- [x] Primeiro login com Google em produção (25/11/2026)
- [x] Gestos de app (arrastar troca de aba, voltar pela borda no app instalado, transições) e
  barra de navegação do Android no tema do celular (25/11/2026)
- [x] Migração dos convites no Neon (25/11/2026, depois de a produção ficar com erro 500)
- [x] Treinos personalizáveis (criar, editar e apagar), conta nova sem fichas e modelos prontos,
  catálogo de 282 exercícios com imagens e substitutos, troca durante o treino, série sem
  confirmar, sem bi-set e sem sugestão do dia (26–27/11/2026)
- [x] Publicado em 27/11/2026: migração `e7d6db65bfa0` no Neon antes do push, depois o seed; as
  fichas dos amigos apagadas e o bi-set tirado das do Henrique, com o histórico mantido
- [ ] `ADMIN_EMAIL` na Vercel (sem ele, ninguém vê a Administração nem gera convites)
- [ ] Instalação nos celulares e convite dos amigos
