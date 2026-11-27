// Criar e editar treinos (fichas). A tela (telas/EditarFicha.tsx) guarda um rascunho em memória e
// só grava ao tocar em Salvar: aqui ficam o rascunho, a validação com os mesmos limites do
// servidor, o que gravar (só o que mudou, para não sincronizar à toa), o Plano B sugerido e a
// busca do seletor de exercícios (componentes/EscolherExercicio.tsx). Tudo sem tela, para testar.

import type { Exercicio, Ficha, FichaExercicio } from "./tipos";

/**
 * Os mesmos limites do servidor (backend/models.py). Um registro fora deles seria recusado (422) e
 * travaria os envios seguintes, por isso o app nem deixa salvar.
 */
export const LIMITES = {
  nomeFicha: 60,
  series: { min: 1, max: 20 },
  alvo: { min: 1, max: 100 },
  observacao: 300,
  alternativas: 2,
  nomeExercicio: 120,
  grupo: 60,
} as const;

/** Como entra um exercício novo no treino. */
export const PADRAO = { series: 3, alvo_reps: 10 } as const;

/** Um exercício do treino sendo editado. */
export interface ItemRascunho {
  /** id do item da ficha: o que já existe ou um novo, gerado ao adicionar. */
  id: string;
  exercicio_id: string;
  series: number;
  alvo_reps: number;
  aquecimento: boolean;
  /** Plano B: até 2 exercícios, em ordem de preferência. */
  alternativas: string[];
  /** Como está no campo; vazio é sem observação. */
  observacao: string;
}

export interface Rascunho {
  nome: string;
  itens: ItemRascunho[];
}

/** Itens da ficha que valem (sem os excluídos), na ordem do treino. */
export function itensDaFicha(itens: FichaExercicio[]): FichaExercicio[] {
  return itens.filter((i) => !i.excluido).sort((a, b) => a.ordem - b.ordem);
}

/** O rascunho de partida: o treino como está (ou vazio, para um novo). */
export function rascunhoDe(ficha: Ficha | null, itens: FichaExercicio[]): Rascunho {
  return {
    nome: ficha?.nome ?? "",
    itens: itensDaFicha(itens).map((i) => ({
      id: i.id,
      exercicio_id: i.exercicio_id,
      series: i.series,
      alvo_reps: i.alvo_reps,
      aquecimento: i.aquecimento,
      alternativas: [...i.alternativas],
      observacao: i.observacao ?? "",
    })),
  };
}

/**
 * Plano B sugerido ao adicionar um exercício: os 2 primeiros `substitutos` dele que existem no
 * banco local (sem os excluídos, sem repetir e sem o próprio exercício).
 */
export function planoBSugerido(exercicio: Exercicio, porId: ReadonlyMap<string, Exercicio>): string[] {
  const escolhidos: string[] = [];
  for (const id of exercicio.substitutos ?? []) {
    if (escolhidos.length === LIMITES.alternativas) break;
    const outro = porId.get(id);
    if (outro && !outro.excluido && id !== exercicio.id && !escolhidos.includes(id)) escolhidos.push(id);
  }
  return escolhidos;
}

/** Exercício acabado de adicionar: 3 × 10, aquecimento só se for o primeiro e o Plano B sugerido. */
export function novoItem(exercicio: Exercicio, porId: ReadonlyMap<string, Exercicio>, id: string, primeiro: boolean): ItemRascunho {
  return {
    id,
    exercicio_id: exercicio.id,
    series: PADRAO.series,
    alvo_reps: PADRAO.alvo_reps,
    aquecimento: primeiro,
    alternativas: planoBSugerido(exercicio, porId),
    observacao: "",
  };
}

/** A lista com o item da posição `de` levado para `para` (fora dos limites, fica como está). */
export function moverItem<T>(lista: T[], de: number, para: number): T[] {
  if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return lista;
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item!);
  return nova;
}

/** `ordem` de uma ficha nova: depois da maior entre as ativas (1 se não houver nenhuma). */
export function proximaOrdem(fichas: Ficha[]): number {
  const ordens = fichas.filter((f) => !f.excluido).map((f) => f.ordem);
  return ordens.length ? Math.max(...ordens) + 1 : 1;
}

const inteiroEntre = (n: number, { min, max }: { min: number; max: number }) => Number.isInteger(n) && n >= min && n <= max;

/** O que impede de salvar, em frases curtas (vazio = pode salvar). `nomeDe` dá o nome do exercício. */
export function problemasDoRascunho(rascunho: Rascunho, nomeDe: (exercicioId: string) => string = () => "Exercício"): string[] {
  const problemas: string[] = [];
  const nome = rascunho.nome.trim();
  if (!nome) problemas.push("Dê um nome ao treino.");
  else if (nome.length > LIMITES.nomeFicha) problemas.push(`O nome do treino pode ter até ${LIMITES.nomeFicha} caracteres.`);
  if (rascunho.itens.length === 0) problemas.push("Adicione pelo menos um exercício.");

  for (const item of rascunho.itens) {
    const de = nomeDe(item.exercicio_id);
    if (!inteiroEntre(item.series, LIMITES.series)) problemas.push(`${de}: as séries vão de ${LIMITES.series.min} a ${LIMITES.series.max}.`);
    if (!inteiroEntre(item.alvo_reps, LIMITES.alvo)) problemas.push(`${de}: o alvo vai de ${LIMITES.alvo.min} a ${LIMITES.alvo.max} repetições.`);
    if (item.observacao.trim().length > LIMITES.observacao) problemas.push(`${de}: a observação pode ter até ${LIMITES.observacao} caracteres.`);
    if (item.alternativas.length > LIMITES.alternativas) problemas.push(`${de}: o Plano B tem no máximo ${LIMITES.alternativas} exercícios.`);
    if (new Set(item.alternativas).size !== item.alternativas.length) problemas.push(`${de}: o Plano B repete um exercício.`);
    if (item.alternativas.includes(item.exercicio_id)) problemas.push(`${de}: o Plano B não pode ter o próprio exercício.`);
  }
  return problemas;
}

const mesmaLista = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

const mesmoItem = (a: ItemRascunho, b: ItemRascunho) =>
  a.id === b.id &&
  a.exercicio_id === b.exercicio_id &&
  a.series === b.series &&
  a.alvo_reps === b.alvo_reps &&
  a.aquecimento === b.aquecimento &&
  mesmaLista(a.alternativas, b.alternativas) &&
  a.observacao.trim() === b.observacao.trim();

/** Mexeu em algo desde que abriu a edição? (Para perguntar antes de descartar.) */
export function houveMudanca(rascunho: Rascunho, inicial: Rascunho): boolean {
  if (rascunho.nome.trim() !== inicial.nome.trim()) return true;
  if (rascunho.itens.length !== inicial.itens.length) return true;
  return rascunho.itens.some((item, i) => !mesmoItem(item, inicial.itens[i]!));
}

/** O que gravar ao salvar: a ficha (null se não mudou) e os itens que mudaram. */
export interface Gravacao {
  fichaId: string;
  ficha: Ficha | null;
  itens: FichaExercicio[];
}

/**
 * Do rascunho aos registros para gravar, comparando com o que está no banco (`ficha` null = treino
 * novo; `itens` são os da ficha, com os excluídos). Ficha nova vai depois da maior `ordem` entre as
 * `fichas` ativas. A `ordem` dos itens é refeita pela posição; só os itens novos ou alterados são
 * gravados; os que saíram do rascunho ficam excluídos. Os itens novos não têm bi-set (o app não usa
 * mais), e os que já existem guardam o `grupo_biset` que tinham. `quando` é o `atualizado_em` (o
 * `salvar` de lib/db.ts o renova ao gravar).
 */
export function montarGravacao(
  rascunho: Rascunho,
  antes: { ficha: Ficha | null; itens: FichaExercicio[]; fichas: Ficha[] },
  gerarId: () => string,
  quando: string,
): Gravacao {
  const nome = rascunho.nome.trim();
  let ficha: Ficha | null = null;
  if (!antes.ficha) ficha = { id: gerarId(), atualizado_em: quando, excluido: false, nome, ordem: proximaOrdem(antes.fichas) };
  else if (antes.ficha.nome !== nome || antes.ficha.excluido) ficha = { ...antes.ficha, nome, excluido: false };
  const fichaId = ficha?.id ?? antes.ficha!.id;

  const existentes = new Map(antes.itens.filter((i) => i.ficha_id === fichaId).map((i) => [i.id, i]));
  const gravar: FichaExercicio[] = [];
  rascunho.itens.forEach((item, ordem) => {
    const campos = {
      exercicio_id: item.exercicio_id,
      ordem,
      series: item.series,
      alvo_reps: item.alvo_reps,
      aquecimento: item.aquecimento,
      alternativas: [...item.alternativas],
      observacao: item.observacao.trim() || null,
    };
    const atual = existentes.get(item.id);
    if (!atual) {
      gravar.push({ id: item.id, atualizado_em: quando, excluido: false, ficha_id: fichaId, grupo_biset: null, ...campos });
      return;
    }
    const mudou =
      atual.excluido ||
      atual.exercicio_id !== campos.exercicio_id ||
      atual.ordem !== campos.ordem ||
      atual.series !== campos.series ||
      atual.alvo_reps !== campos.alvo_reps ||
      atual.aquecimento !== campos.aquecimento ||
      !mesmaLista(atual.alternativas, campos.alternativas) ||
      (atual.observacao ?? null) !== campos.observacao;
    if (mudou) gravar.push({ ...atual, ...campos, excluido: false });
  });

  const ficam = new Set(rascunho.itens.map((i) => i.id));
  for (const item of existentes.values()) {
    if (!item.excluido && !ficam.has(item.id)) gravar.push({ ...item, excluido: true });
  }
  return { fichaId, ficha, itens: gravar };
}

/**
 * Apagar o treino: a ficha e os itens dela ficam excluídos (exclusão lógica). As sessões não mudam,
 * para o histórico e os gráficos continuarem.
 */
export function registrosParaApagar(ficha: Ficha, itens: FichaExercicio[]): { ficha: Ficha; itens: FichaExercicio[] } {
  return {
    ficha: { ...ficha, excluido: true },
    itens: itens.filter((i) => i.ficha_id === ficha.id && !i.excluido).map((i) => ({ ...i, excluido: true })),
  };
}

// --- Seletor de exercícios --------------------------------------------------------------------

/** Sem acento e em minúsculas, para a busca achar "supino" em "Supino" e "biceps" em "Bíceps". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Os grupos musculares do catálogo, na ordem em que aparecem no seletor: empurrar, puxar, pernas e
 * core, como no backend/data/treino.toml (e não em ordem alfabética, que abriria em Abdômen,
 * Abdutores e Adutores, longe de Peito e Costas). Também são os grupos para criar um exercício
 * quando o catálogo ainda não chegou ao aparelho.
 */
export const ORDEM_GRUPOS = [
  "Peito",
  "Ombro",
  "Tríceps",
  "Costas",
  "Trapézio",
  "Bíceps",
  "Antebraço",
  "Posterior de ombro",
  "Quadríceps",
  "Posterior de coxa",
  "Glúteo",
  "Panturrilha",
  "Adutores",
  "Abdutores",
  "Abdômen",
  "Lombar",
] as const;

/** Compara grupos pela ordem do catálogo; um grupo fora dela vai para o fim, em ordem alfabética. */
function compararGrupos(a: string, b: string): number {
  const posicao = (g: string) => {
    const i = (ORDEM_GRUPOS as readonly string[]).indexOf(g);
    return i === -1 ? ORDEM_GRUPOS.length : i;
  };
  return posicao(a) - posicao(b) || a.localeCompare(b, "pt-BR");
}

/** Grupos musculares que existem, na ordem do catálogo. */
export function gruposDe(exercicios: Exercicio[]): string[] {
  return [...new Set(exercicios.filter((e) => !e.excluido).map((e) => e.grupo_muscular))].sort(compararGrupos);
}

/**
 * Os exercícios que aparecem no seletor (catálogo e próprios, sem os excluídos), filtrados pelo
 * grupo e pela busca: cada palavra buscada tem de estar no nome ("supino halter" acha "Supino
 * inclinado com halter"). Em ordem alfabética.
 */
export function filtrarExercicios(exercicios: Exercicio[], busca: string, grupo: string | null): Exercicio[] {
  const palavras = normalizar(busca).split(/\s+/).filter(Boolean);
  return exercicios
    .filter((e) => !e.excluido && (!grupo || e.grupo_muscular === grupo))
    .filter((e) => {
      const nome = normalizar(e.nome);
      return palavras.every((p) => nome.includes(p));
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * A lista separada por grupo muscular, na ordem do catálogo (a ordem de dentro é mantida). `primeiro`
 * vem antes dos outros: no Plano B, o grupo do próprio exercício.
 */
export function agruparPorGrupo(exercicios: Exercicio[], primeiro?: string): { grupo: string; itens: Exercicio[] }[] {
  const grupos = new Map<string, Exercicio[]>();
  for (const e of exercicios) grupos.set(e.grupo_muscular, [...(grupos.get(e.grupo_muscular) ?? []), e]);
  return [...grupos]
    .sort(([a], [b]) => Number(b === primeiro) - Number(a === primeiro) || compararGrupos(a, b))
    .map(([grupo, itens]) => ({ grupo, itens }));
}

/** No Plano B: os substitutos do exercício primeiro (na ordem dele), como sugestão, e o resto depois. */
export function separarSugestoes(base: Exercicio | undefined, lista: Exercicio[]): { sugestoes: Exercicio[]; resto: Exercicio[] } {
  const ordem = base?.substitutos ?? [];
  const sugestoes = ordem.map((id) => lista.find((e) => e.id === id)).filter((e): e is Exercicio => e !== undefined);
  const ids = new Set(sugestoes.map((e) => e.id));
  return { sugestoes, resto: lista.filter((e) => !ids.has(e.id)) };
}

/** O que impede de criar o exercício (vazio = pode criar). */
export function problemasDoExercicio(nome: string, grupo: string | null, exercicios: Exercicio[]): string[] {
  const problemas: string[] = [];
  const limpo = nome.trim();
  if (!limpo) problemas.push("Dê um nome ao exercício.");
  else if (limpo.length > LIMITES.nomeExercicio) problemas.push(`O nome pode ter até ${LIMITES.nomeExercicio} caracteres.`);
  else if (exercicios.some((e) => !e.excluido && normalizar(e.nome) === normalizar(limpo))) {
    problemas.push("Já existe um exercício com esse nome. Procure-o na lista.");
  }
  if (!grupo?.trim()) problemas.push("Escolha o grupo muscular.");
  else if (grupo.trim().length > LIMITES.grupo) problemas.push(`O grupo pode ter até ${LIMITES.grupo} caracteres.`);
  return problemas;
}

/** Um exercício próprio, criado no app: sem imagens, passos nem vídeo. */
export function criarExercicio(nome: string, grupo: string, id: string, quando: string): Exercicio {
  return {
    id,
    atualizado_em: quando,
    excluido: false,
    nome: nome.trim(),
    grupo_muscular: grupo.trim(),
    imagens: [],
    instrucoes: [],
    midia_url: null,
    substitutos: [],
  };
}
