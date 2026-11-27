// Modelos prontos: treinos já montados (as fichas modelo do catálogo, GET /api/modelos) que a
// pessoa copia para as suas. A conta nova começa sem fichas, e quem quiser parte de um modelo. A
// cópia é feita no aparelho, com ids novos, e vai ao servidor na sincronização, como uma ficha
// criada pela própria pessoa. Aqui fica o que dá para testar sem tela (também a lista "Seus
// treinos" da tela inicial); a janela está em componentes/ModelosProntos.tsx.

import type { Ficha, FichaExercicio, Sessao } from "./tipos";

/** Um exercício do modelo, como vem de GET /api/modelos (sem bi-set). */
export interface ItemModelo {
  exercicio_id: string;
  ordem: number;
  series: number;
  alvo_reps: number;
  aquecimento: boolean;
  alternativas: string[];
  observacao: string | null;
}

/** Um modelo pronto, como vem de GET /api/modelos (os exercícios já em `ordem`). */
export interface Modelo {
  id: string;
  nome: string;
  ordem: number;
  exercicios: ItemModelo[];
}

/** A cópia de um modelo: a ficha nova da pessoa e os itens dela. */
export interface CopiaDoModelo {
  ficha: Ficha;
  itens: FichaExercicio[];
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "6 exercícios · 18 séries", sem os itens excluídos (serve para as fichas e para os modelos). */
export function resumoDoTreino(itens: { series: number; excluido?: boolean }[]): string {
  const ativos = itens.filter((i) => !i.excluido);
  if (ativos.length === 0) return "Nenhum exercício";
  const series = ativos.reduce((soma, i) => soma + i.series, 0);
  return `${plural(ativos.length, "exercício", "exercícios")} · ${plural(series, "série", "séries")}`;
}

/** Uma ficha da lista "Seus treinos", com o início do último treino feito com ela (null: nunca). */
export interface TreinoDaLista {
  ficha: Ficha;
  ultima: string | null;
}

/**
 * As fichas ativas na `ordem` (desempate pelo nome), cada uma com a última vez que foi feita: o
 * início mais recente entre as sessões dela finalizadas e não excluídas. Sem sugestão do dia.
 */
export function listarTreinos(fichas: Ficha[], sessoes: Sessao[]): TreinoDaLista[] {
  const ultima = new Map<string, string>();
  for (const s of sessoes) {
    if (s.excluido || !s.finalizada_em || !s.ficha_id) continue;
    const atual = ultima.get(s.ficha_id);
    if (!atual || Date.parse(s.iniciada_em) > Date.parse(atual)) ultima.set(s.ficha_id, s.iniciada_em);
  }
  return fichas
    .filter((f) => !f.excluido)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((ficha) => ({ ficha, ultima: ultima.get(ficha.id) ?? null }));
}

/** `ordem` da próxima ficha: depois da maior entre as fichas ativas (1 se não houver nenhuma). */
export function proximaOrdem(fichas: Ficha[]): number {
  const ordens = fichas.filter((f) => !f.excluido).map((f) => f.ordem);
  return ordens.length ? Math.max(...ordens) + 1 : 1;
}

/**
 * Monta a cópia de um modelo: ficha e itens com ids novos (de `gerarId`), a ficha na `ordem` dada
 * e o resto igual ao modelo, sem bi-set. `quando` é o `atualizado_em` (o `salvar` de lib/db.ts o
 * renova ao gravar).
 */
export function copiarModelo(modelo: Modelo, ordem: number, gerarId: () => string, quando: string): CopiaDoModelo {
  const ficha: Ficha = { id: gerarId(), atualizado_em: quando, excluido: false, nome: modelo.nome, ordem };
  const itens = modelo.exercicios.map(
    (item): FichaExercicio => ({
      id: gerarId(),
      atualizado_em: quando,
      excluido: false,
      ficha_id: ficha.id,
      exercicio_id: item.exercicio_id,
      ordem: item.ordem,
      series: item.series,
      alvo_reps: item.alvo_reps,
      aquecimento: item.aquecimento,
      grupo_biset: null,
      alternativas: [...item.alternativas],
      observacao: item.observacao,
    }),
  );
  return { ficha, itens };
}

/** Vários modelos de uma vez ("Adicionar todos"): na ordem da lista, com `ordem` seguidas a partir da dada. */
export function copiarModelos(modelos: Modelo[], ordem: number, gerarId: () => string, quando: string): CopiaDoModelo[] {
  return modelos.map((modelo, i) => copiarModelo(modelo, ordem + i, gerarId, quando));
}
