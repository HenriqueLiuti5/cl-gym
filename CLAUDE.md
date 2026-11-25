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
uv run python -m backend.dados_dev        # enche a conta do "Entrar como dev" com meses de dados
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
Plano B, peso caindo, calorias, proteína, carbo, água e metas, uma delas já alcançada) na mesma
conta do "Entrar como dev". Pode rodar de novo; não mexe no que foi lançado à mão.

```bash
cd frontend
npm ci                                    # dependências do app, exatas do package-lock.json
npm run dev                               # app em http://localhost:5173 (/api vai para a :8000)
npm run lint && npm run typecheck && npm test
npm run build                             # gera frontend/dist com o service worker
```

Para testar o app sem um `GOOGLE_CLIENT_ID` de verdade, ponha `LOGIN_DEV=1` no `.env`: a tela de
login mostra "Entrar como dev" (com um e-mail de `EMAILS_PERMITIDOS`). Isso só funciona com banco
SQLite e fora da Vercel (`VERCEL` no ambiente); em produção `/api/auth/dev` responde 404. O
`.claude/launch.json` tem os servidores `api` e `app` para o painel de navegador do Claude Code.

Configuração via `.env` (veja `.env.example`): `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `SESSAO_SECRET`
(mínimo 32 caracteres), `EMAILS_PERMITIDOS` (separados por vírgula) e, opcional, `SESSAO_DIAS`
(padrão 90) e `LOGIN_DEV` (só local). As migrações e o seed só precisam do `DATABASE_URL`.

## Estrutura

```
api/index.py            entrada da Vercel (importa backend.main:app)
backend/
  main.py               app FastAPI (/api/health, rotas)
  config.py             Settings (banco, Google, sessão, convites)
  db.py                 engine, sessão, tipos UTCDateTime e ListaUUID
  auth.py               verificação do ID token do Google, token de sessão, usuário atual
  conta.py              primeiro login (cópia das fichas modelo) e apagar conta
  models.py             tabelas + esquemas de sincronização
  sync.py               lógica de envio/download, separada por usuário
  routers/auth.py       GET /api/auth/config, POST /api/auth/google, POST /api/auth/dev (só local)
  routers/conta.py      GET/PATCH/DELETE /api/conta (perfil; apagar a conta)
  routers/sync.py       GET/POST /api/sync
  seed.py               carrega o catálogo do TOML
  dados_dev.py          dados inventados para a conta de dev (só SQLite)
  data/treino.toml      exercícios do catálogo e fichas modelo
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
  src/lib/regras.ts            sugestão do dia, última vez, avisos de progressão, bi-set
  src/lib/metas.ts             metas: limites, salvar offline, progresso, "na meta", parabéns
  src/lib/estatisticas.ts      números da Evolução (treinos, recordes, peso, alimentação, escala)
  src/lib/curiosidades.ts      curiosidades com comparações (elefantes, Pão de Açúcar, ovos...)
  src/lib/perfil.ts            perfil (primeiro acesso e Conta): limites, altura, peso atual
  src/lib/ids.ts               UUID v4 e v5 (ids do registro do dia e das metas), sem https
  src/lib/api.ts, sessao.ts    chamadas à API, token, login (Google e dev), sair
  src/telas/                   Login, BoasVindas, Inicio, FichaTela, Treino, Dia, Graficos, Conta
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
  ajuste da ficha, cancelar treino), juntando mudanças seguidas (`sincronizarEmBreve`); ao terminar um
  treino; quando a internet volta (evento `online`); e no botão "Sincronizar" da tela Conta. As
  séries do treino em andamento não disparam sincronização: vão juntas no fim. Se o app for para
  segundo plano com uma sincronização agendada, ela sai na hora. Nunca em intervalo fixo. Uma
  chamada no meio de outra sincronização roda de novo no fim, para levar o que mudou.
- **Sem internet** (`navigator.onLine` falso) o app nem tenta e não mostra aviso: tudo fica no
  celular até a próxima vez. A faixa no topo só aparece em erro de verdade.
- Erro 5xx ou falta de rede contam como "sem internet": tudo fica no celular. 401 pede login de
  novo sem apagar os dados locais. O app valida os mesmos limites do servidor (ex.: carga até
  1000 kg), porque um registro recusado (422) travaria os envios seguintes.
- Todas as rotas exceto `/api/health` e `/api/auth/google` exigem `Authorization: Bearer <token
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
  offline).
- **Exercicio**: nome, grupo_muscular, imagens (URLs), instrucoes (passos em PT) e midia_url (GIF
  ou vídeo). Os do catálogo vêm do seed e só o seed altera; cada um pode criar os seus. É o único
  download que traz `usuario_id` (nulo = catálogo, só leitura no app).
- **Ficha**: treino nomeado (Push, Pull, Leg day, Upper) e `ordem`. As do catálogo são **modelos**:
  não são baixadas, só copiadas para o usuário no primeiro login (`backend/conta.py`).
- **FichaExercicio**: exercício planejado na ficha, com `ordem`, `series`, `alvo_reps` (int),
  `aquecimento` (bool), `grupo_biset` (int ou nulo), `alternativas` (lista ordenada de até 2
  `exercicio_id`, o Plano B) e `observacao` (dicas de execução).
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
- **Sugestão do dia**: destacar a ficha feita **há mais tempo** (nunca feita vem primeiro;
  desempate por `ordem`). É só sugestão, todas as fichas continuam selecionáveis.
- **Última vez**: para cada exercício, mostrar carga × reps da sessão mais recente em que ele foi
  feito.
- **Trocar**: alterna entre o exercício planejado e as alternativas do item (Plano B); a série é
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
- **Registrar a série:** cada linha tem "Anterior" (carga × reps da mesma série na última vez),
  kg (já vem com a carga sugerida), reps (a dica é o alvo) e um botão de marcar. Marcar grava a
  série e pinta a linha de verde; tocar de novo desmarca (apaga a série) e deixa os números nos
  campos. Mudar um número de uma série marcada faz o botão gravar de novo.
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
- **Logo e ícone do app** (decidido em 25/11/2026): o emblema CL em preto e branco de
  `frontend/marca/logo.png`, a imagem do Henrique ampliada e limpa. É a única exceção à regra de
  brilho e gradiente: não redesenhar nem colorir. Os PNGs de `public/` saem dela com
  `uv run scripts/icones.py`, em fundo preto e quadrado inteiro (o sistema aplica a máscara); no
  maskable o desenho fica dentro da área segura. A tela de login mostra o `icone-512.png`.

## Catálogo (seed)

`backend/data/treino.toml` é a fonte dos exercícios do catálogo e das fichas modelo (formato
explicado no próprio arquivo). IDs = `uuid5` do slug, então
rodar o seed de novo só regrava o que mudou (com versão nova, para os celulares baixarem). Não
mude slugs em uso, porque o histórico está ligado a eles. Demonstrações: imagens da base de domínio
público **free-exercise-db** e um link para busca no YouTube. Não copie GIFs com direitos autorais
para o repositório.

## Plano multiusuário (v1 para os amigos)

Decidido com o Henrique em 24/11/2026. Ainda não existe nada em produção, então o esquema pode
mudar à vontade (nova migração, sem migrar dados).

### Login e convites
- **Entrar com Google.** O frontend usa o Google Identity Services e recebe um *ID token*. O
  backend (`POST /api/auth/google`) confere a assinatura, o `aud` (= `GOOGLE_CLIENT_ID`),
  `email_verified` e se o e-mail está em `EMAILS_PERMITIDOS` (lista separada por vírgula). Não tem
  senha nem envio de e-mail.
- Aprovado, o backend cria (ou acha) o **Usuario** pelo `sub` do Google e devolve um **token de
  sessão próprio**, assinado com `SESSAO_SECRET`, de longa duração (uns 90 dias). Ele fica no
  aparelho e permite usar e sincronizar sem pedir o Google de novo, inclusive depois de ficar
  offline.
- **Só entra convidado.** Para chamar um amigo, o Henrique adiciona o e-mail em
  `EMAILS_PERMITIDOS` na Vercel e faz redeploy. Isso impede que estranhos gastem o limite grátis.
- Remover um e-mail da lista bloqueia novos logins e a sincronização daquele usuário.

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
- **Bi-set:** `grupo_biset: int | None` no item da ficha. Itens da mesma ficha com o mesmo valor são
  feitos em sequência, descansando só depois do par. Se um tiver mais séries, as voltas extras são
  só dele.
- **Plano B com até 2 opções por item da ficha** (`alternativas`: lista ordenada de
  `exercicio_id`), no lugar do `substituto_id` único do exercício. A série é gravada com o
  exercício realmente feito, e cada um tem o próprio histórico.
- **Última vez**, **sugestão do dia** (ficha feita há mais tempo) e **gráfico de evolução**
  continuam como estão em "Regras de negócio".
- **Contador de treinos feitos** (sessões finalizadas) na tela inicial.
- **Fichas iniciais:** no primeiro login, o usuário recebe uma cópia das fichas modelo do
  `treino.toml` (o treino v2 do Henrique: Push, Pull, Leg day e Upper, com Plano B). Depois cada
  um edita as suas.

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
- **Sem tela "Como instalar"** no app (decidido em 24/11/2026): ao abrir o link, o navegador já
  oferece instalar. No iPhone o Safari não mostra esse botão, então quem tiver iPhone precisa do
  passo acima junto com o link.
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
- Convites por tela de admin em vez de variável de ambiente.

## Deploy (a fazer)

1. Criar o banco no Neon e usar a URL **pooled** (`-pooler`) como `DATABASE_URL` na Vercel.
2. Definir na Vercel `GOOGLE_CLIENT_ID`, `SESSAO_SECRET` e `EMAILS_PERMITIDOS` (antes era o
   `APP_TOKEN`).
3. No Google Cloud (sem faturamento): criar o cliente OAuth do tipo "Aplicativo da Web" com as
   origens `http://localhost:5173` e `https://cl-gym.vercel.app`.
4. Rodar as migrações e o seed no Neon a partir da máquina local:
   `DATABASE_URL="..." uv run alembic upgrade head && DATABASE_URL="..." uv run python -m backend.seed`.
5. O `vercel.json` já define o build do frontend (`npm --prefix frontend ci`,
   `npm --prefix frontend run build`, saída `frontend/dist`) e o rewrite de `/api`. Validar no
   primeiro deploy como a Vercel instala as dependências Python (pyproject/uv.lock ou
   `requirements.txt` via `uv export`). Nunca definir `LOGIN_DEV` na Vercel (ele já não funciona
   lá, mas não precisa estar). O Henrique faz os passos que pedem login nas contas dele.

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
- [ ] Deploy Vercel + Neon e instalação nos celulares
