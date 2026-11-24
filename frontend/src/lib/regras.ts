// Regras do treino, calculadas sobre os dados locais (veja "Regras de negócio" no CLAUDE.md).

import type { Ficha, FichaExercicio, RegistroDiario, Serie, Sessao } from "./tipos";

const ativos = <T extends { excluido: boolean }>(lista: T[]) => lista.filter((r) => !r.excluido);

/** AAAA-MM-DD no fuso do aparelho. */
export function dataLocal(data: Date = new Date()): string {
  const m = String(data.getMonth() + 1).padStart(2, "0");
  const d = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${m}-${d}`;
}

export function treinosFeitos(sessoes: Sessao[]): number {
  return ativos(sessoes).filter((s) => s.finalizada_em).length;
}

/** Fichas na ordem da sugestão: nunca feita primeiro, depois a feita há mais tempo. */
export function ordenarPorSugestao(
  fichas: Ficha[],
  sessoes: Sessao[],
): { ficha: Ficha; ultima: string | null }[] {
  const ultima = new Map<string, string>();
  for (const s of ativos(sessoes)) {
    if (!s.ficha_id || !s.finalizada_em) continue;
    const atual = ultima.get(s.ficha_id);
    if (!atual || s.iniciada_em > atual) ultima.set(s.ficha_id, s.iniciada_em);
  }
  return ativos(fichas)
    .map((ficha) => ({ ficha, ultima: ultima.get(ficha.id) ?? null }))
    .sort((a, b) => {
      if (a.ultima !== b.ultima) {
        if (a.ultima === null) return -1;
        if (b.ultima === null) return 1;
        return Date.parse(a.ultima) - Date.parse(b.ultima);
      }
      return a.ficha.ordem - b.ficha.ordem;
    });
}

export interface UltimaVez {
  sessao: Sessao;
  series: Serie[];
}

/** Séries da sessão mais recente (fora a atual) em que o exercício foi feito. */
export function ultimaVez(
  exercicioId: string,
  series: Serie[],
  sessoes: Sessao[],
  excetoSessaoId?: string,
): UltimaVez | null {
  const porId = new Map(ativos(sessoes).map((s) => [s.id, s]));
  const porSessao = new Map<string, Serie[]>();
  for (const serie of ativos(series)) {
    if (serie.exercicio_id !== exercicioId || serie.sessao_id === excetoSessaoId) continue;
    if (!porId.has(serie.sessao_id)) continue;
    porSessao.set(serie.sessao_id, [...(porSessao.get(serie.sessao_id) ?? []), serie]);
  }
  let melhor: UltimaVez | null = null;
  for (const [sessaoId, lista] of porSessao) {
    const sessao = porId.get(sessaoId)!;
    if (!melhor || sessao.iniciada_em > melhor.sessao.iniciada_em) {
      melhor = { sessao, series: lista.sort((a, b) => a.numero - b.numero) };
    }
  }
  return melhor;
}

export interface Aviso {
  sobe: boolean;
  pesado: boolean;
}

/** "Sobe o peso" se a 1ª série fez alvo + 2 ou mais; "pesado demais" se alguma ficou 2 abaixo. */
export function avisoProgressao(alvo: number, series: Serie[]): Aviso {
  const ordenadas = [...series].sort((a, b) => a.numero - b.numero);
  const primeira = ordenadas[0];
  return {
    sobe: primeira !== undefined && primeira.repeticoes >= alvo + 2,
    pesado: ordenadas.some((s) => s.repeticoes <= alvo - 2),
  };
}

/** Agrupa os itens em blocos: sozinho ou bi-set (mesmo `grupo_biset`), na ordem da ficha. */
export function blocos(itens: FichaExercicio[]): FichaExercicio[][] {
  const ordenados = ativos(itens).sort((a, b) => a.ordem - b.ordem);
  const resultado: FichaExercicio[][] = [];
  const porGrupo = new Map<number, FichaExercicio[]>();
  for (const item of ordenados) {
    if (item.grupo_biset === null) {
      resultado.push([item]);
      continue;
    }
    const bloco = porGrupo.get(item.grupo_biset);
    if (bloco) bloco.push(item);
    else {
      const novo = [item];
      porGrupo.set(item.grupo_biset, novo);
      resultado.push(novo);
    }
  }
  return resultado;
}

/** Próximo exercício ao tocar em "Plano B": planejado → 1ª opção → 2ª opção → planejado. */
export function proximaOpcao(item: FichaExercicio, atual: string): string {
  const opcoes = [item.exercicio_id, ...item.alternativas];
  const i = opcoes.indexOf(atual);
  return opcoes[(i + 1) % opcoes.length]!;
}

export interface Ponto {
  data: string;
  valor: number;
}

/** Maior carga de cada sessão em que o exercício foi feito, em ordem de data. */
export function evolucao(exercicioId: string, series: Serie[], sessoes: Sessao[]): Ponto[] {
  const porId = new Map(ativos(sessoes).map((s) => [s.id, s]));
  const maior = new Map<string, number>();
  for (const s of ativos(series)) {
    if (s.exercicio_id !== exercicioId || !porId.has(s.sessao_id)) continue;
    maior.set(s.sessao_id, Math.max(maior.get(s.sessao_id) ?? 0, s.carga_kg));
  }
  return [...maior]
    .map(([sessaoId, valor]) => ({ data: porId.get(sessaoId)!.iniciada_em, valor }))
    .sort((a, b) => Date.parse(a.data) - Date.parse(b.data));
}

function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number) as [number, number, number];
  return dataLocal(new Date(a, m - 1, d + dias));
}

/** Peso de cada dia e a média dos 7 dias que terminam nele (só dias com peso). */
export function pesoComMedia7(
  registros: RegistroDiario[],
): { data: string; peso: number; media7: number }[] {
  const comPeso = ativos(registros)
    .filter((r) => r.peso_kg !== null)
    .sort((a, b) => a.data.localeCompare(b.data));
  return comPeso.map((r) => {
    const inicio = somarDias(r.data, -6);
    const janela = comPeso.filter((x) => x.data >= inicio && x.data <= r.data);
    const media = janela.reduce((soma, x) => soma + x.peso_kg!, 0) / janela.length;
    return { data: r.data, peso: r.peso_kg!, media7: Math.round(media * 100) / 100 };
  });
}

/** Segunda-feira da semana da data (AAAA-MM-DD). */
export function inicioDaSemana(data: string): string {
  const [a, m, d] = data.split("-").map(Number) as [number, number, number];
  const dia = new Date(a, m - 1, d);
  const desdeSegunda = (dia.getDay() + 6) % 7;
  return somarDias(data, -desdeSegunda);
}

/** Média por semana de kcal e proteína, contando só os dias em que foram lançadas. */
export function mediasSemanais(
  registros: RegistroDiario[],
): { semana: string; kcal: number | null; proteina: number | null }[] {
  const semanas = new Map<string, { kcal: number[]; proteina: number[] }>();
  for (const r of ativos(registros)) {
    const semana = inicioDaSemana(r.data);
    const grupo = semanas.get(semana) ?? { kcal: [], proteina: [] };
    if (r.kcal !== null) grupo.kcal.push(r.kcal);
    if (r.proteina_g !== null) grupo.proteina.push(r.proteina_g);
    semanas.set(semana, grupo);
  }
  const media = (v: number[]) =>
    v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  return [...semanas]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, g]) => ({ semana, kcal: media(g.kcal), proteina: media(g.proteina) }))
    .filter((s) => s.kcal !== null || s.proteina !== null);
}
