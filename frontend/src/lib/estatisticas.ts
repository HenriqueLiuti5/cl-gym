// Números da tela de Evolução, calculados sobre os dados locais. Funções puras: recebem as
// listas (e "hoje", para os testes) e não leem o banco.

import { dataLocal, inicioDaSemana, pesoComMedia7, somarDias } from "./regras";
import type { Exercicio, Ficha, FichaExercicio, RegistroDiario, Serie, Sessao } from "./tipos";

const ativos = <T extends { excluido: boolean }>(lista: T[]) => lista.filter((r) => !r.excluido);
const soma = (valores: number[]) => valores.reduce((a, b) => a + b, 0);
const DIA_MS = 86_400_000;

/** Dias entre duas datas AAAA-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA_MS);
}

// --- Treinos ---------------------------------------------------------------------------------

export interface Treino {
  sessao: Sessao;
  /** Dia no fuso do aparelho. */
  data: string;
  inicio: Date;
  /** Duração; null se ficou aberto por horas (esqueceram de terminar). */
  minutos: number | null;
  series: Serie[];
  /** Soma de carga × repetições. */
  volume: number;
}

/** Treinos terminados (e não descartados), do mais antigo ao mais novo. */
export function montarTreinos(sessoes: Sessao[], series: Serie[]): Treino[] {
  const porSessao = new Map<string, Serie[]>();
  for (const s of ativos(series)) porSessao.set(s.sessao_id, [...(porSessao.get(s.sessao_id) ?? []), s]);
  return ativos(sessoes)
    .filter((s) => s.finalizada_em)
    .map((sessao) => {
      const inicio = new Date(sessao.iniciada_em);
      const minutos = (Date.parse(sessao.finalizada_em!) - inicio.getTime()) / 60_000;
      const lista = (porSessao.get(sessao.id) ?? []).sort((a, b) => a.numero - b.numero);
      return {
        sessao,
        data: dataLocal(inicio),
        inicio,
        minutos: minutos >= 1 && minutos <= 240 ? minutos : null,
        series: lista,
        volume: soma(lista.map((s) => s.carga_kg * s.repeticoes)),
      };
    })
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

export function resumoTreinos(treinos: Treino[]) {
  const comDuracao = treinos.filter((t) => t.minutos !== null);
  const minutos = soma(comDuracao.map((t) => t.minutos!));
  return {
    total: treinos.length,
    series: soma(treinos.map((t) => t.series.length)),
    reps: soma(treinos.map((t) => soma(t.series.map((s) => s.repeticoes)))),
    volume: soma(treinos.map((t) => t.volume)),
    minutos,
    mediaMinutos: comDuracao.length ? minutos / comDuracao.length : null,
    maisLongo: comDuracao.reduce<Treino | null>((m, t) => (!m || t.minutos! > m.minutos! ? t : m), null),
    primeiro: treinos[0] ?? null,
  };
}

/** Treinos em cada semana (segunda a domingo), da semana de `desde` até a de `hoje`. */
export function treinosPorSemana(treinos: Treino[], desde: string, hoje: string): { semana: string; total: number }[] {
  const contagem = new Map<string, number>();
  for (const t of treinos) {
    const semana = inicioDaSemana(t.data);
    contagem.set(semana, (contagem.get(semana) ?? 0) + 1);
  }
  const semanas: { semana: string; total: number }[] = [];
  for (let s = inicioDaSemana(desde); s <= hoje; s = somarDias(s, 7)) {
    semanas.push({ semana: s, total: contagem.get(s) ?? 0 });
  }
  return semanas;
}

/** Semanas seguidas com pelo menos `meta` treinos. A semana atual (a última) só soma quando já
 * bateu: enquanto não acaba, não quebra a sequência. */
export function sequenciaDeSemanas(porSemana: { total: number }[], meta: number): { atual: number; melhor: number } {
  let melhor = 0;
  let corrida = 0;
  porSemana.forEach((s, i) => {
    const ultima = i === porSemana.length - 1;
    if (s.total >= meta) corrida += 1;
    else if (!ultima) corrida = 0;
    melhor = Math.max(melhor, corrida);
  });
  return { atual: corrida, melhor };
}

export interface DiaCalendario {
  data: string;
  treinos: Treino[];
  futuro: boolean;
}

/** Grade das últimas `semanas` semanas: uma coluna por semana, de segunda a domingo. */
export function calendario(treinos: Treino[], semanas: number, hoje: string): DiaCalendario[][] {
  const porDia = new Map<string, Treino[]>();
  for (const t of treinos) porDia.set(t.data, [...(porDia.get(t.data) ?? []), t]);
  const primeira = somarDias(inicioDaSemana(hoje), -7 * (semanas - 1));
  return Array.from({ length: semanas }, (_, s) =>
    Array.from({ length: 7 }, (_, d) => {
      const data = somarDias(primeira, s * 7 + d);
      return { data, treinos: porDia.get(data) ?? [], futuro: data > hoje };
    }),
  );
}

export const DIAS_DA_SEMANA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/** Dia da semana com mais treinos (0 = segunda). */
export function diaFavorito(treinos: Treino[]): { dia: number; total: number } | null {
  const contagem = Array<number>(7).fill(0);
  for (const t of treinos) contagem[(t.inicio.getDay() + 6) % 7]! += 1;
  const total = Math.max(...contagem);
  return total > 0 ? { dia: contagem.indexOf(total), total } : null;
}

export type Periodo = "madrugada" | "manhã" | "tarde" | "noite";

export function periodoDoDia(hora: number): Periodo {
  if (hora < 5) return "madrugada";
  if (hora < 12) return "manhã";
  if (hora < 18) return "tarde";
  return "noite";
}

export function periodoFavorito(treinos: Treino[]): { periodo: Periodo; fracao: number } | null {
  if (!treinos.length) return null;
  const contagem = new Map<Periodo, number>();
  for (const t of treinos) {
    const p = periodoDoDia(t.inicio.getHours());
    contagem.set(p, (contagem.get(p) ?? 0) + 1);
  }
  const [periodo, total] = [...contagem].sort((a, b) => b[1] - a[1])[0]!;
  return { periodo, fracao: total / treinos.length };
}

const minutoDoDia = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** O treino que começou mais cedo e o que começou mais tarde (pelo horário do dia). */
export function extremosDeHorario(treinos: Treino[]): { cedo: Treino; tarde: Treino } | null {
  if (!treinos.length) return null;
  const ordem = [...treinos].sort((a, b) => minutoDoDia(a.inicio) - minutoDoDia(b.inicio));
  return { cedo: ordem[0]!, tarde: ordem[ordem.length - 1]! };
}

/** Maior número de dias seguidos com treino. */
export function maiorSequenciaDeDias(datas: string[]): number {
  const unicas = [...new Set(datas)].sort();
  let melhor = 0;
  let corrida = 0;
  unicas.forEach((d, i) => {
    corrida = i > 0 && diasEntre(unicas[i - 1]!, d) === 1 ? corrida + 1 : 1;
    melhor = Math.max(melhor, corrida);
  });
  return melhor;
}

/** Maior intervalo sem treinar entre dois treinos (em dias, contando só os dias parados). */
export function maiorPausa(treinos: Treino[]): { dias: number; de: string; ate: string } | null {
  const datas = [...new Set(treinos.map((t) => t.data))].sort();
  let maior: { dias: number; de: string; ate: string } | null = null;
  for (let i = 1; i < datas.length; i++) {
    const dias = diasEntre(datas[i - 1]!, datas[i]!) - 1;
    if (dias > 0 && (!maior || dias > maior.dias)) maior = { dias, de: datas[i - 1]!, ate: datas[i]! };
  }
  return maior;
}

// --- Exercícios ------------------------------------------------------------------------------

/** 1 repetição máxima estimada (fórmula de Epley). */
export const umaRepeticaoMaxima = (carga: number, reps: number) => (reps <= 1 ? carga : carga * (1 + reps / 30));

export interface PontoCarga {
  t: number;
  data: string;
  /** Maior carga do treino e as reps da série com ela. */
  valor: number;
  reps: number;
}

export interface ResumoExercicio {
  exercicio: Exercicio;
  pontos: PontoCarga[];
  treinos: number;
  recorde: PontoCarga;
  primeiro: PontoCarga;
  ultima: { data: string; series: Serie[] };
  e1rm: { valor: number; carga: number; reps: number; data: string };
  volume: number;
  series: number;
  repsMedia: number;
}

export function resumoExercicio(exercicio: Exercicio, treinos: Treino[]): ResumoExercicio | null {
  const pontos: PontoCarga[] = [];
  let ultima: { data: string; series: Serie[] } | null = null;
  let e1rm: ResumoExercicio["e1rm"] | null = null;
  let volume = 0;
  let reps = 0;
  let quantas = 0;
  for (const t of treinos) {
    const doExercicio = t.series.filter((s) => s.exercicio_id === exercicio.id);
    if (!doExercicio.length) continue;
    const melhor = doExercicio.reduce((m, s) => (s.carga_kg > m.carga_kg || (s.carga_kg === m.carga_kg && s.repeticoes > m.repeticoes) ? s : m));
    pontos.push({ t: t.inicio.getTime(), data: t.data, valor: melhor.carga_kg, reps: melhor.repeticoes });
    ultima = { data: t.data, series: doExercicio };
    for (const s of doExercicio) {
      volume += s.carga_kg * s.repeticoes;
      reps += s.repeticoes;
      quantas += 1;
      const estimado = umaRepeticaoMaxima(s.carga_kg, s.repeticoes);
      if (s.repeticoes > 0 && (!e1rm || estimado > e1rm.valor)) {
        e1rm = { valor: estimado, carga: s.carga_kg, reps: s.repeticoes, data: t.data };
      }
    }
  }
  if (!pontos.length || !ultima) return null;
  const recorde = pontos.reduce((m, p) => (p.valor > m.valor ? p : m));
  return {
    exercicio,
    pontos,
    treinos: pontos.length,
    recorde,
    primeiro: pontos[0]!,
    ultima,
    e1rm: e1rm ?? { valor: recorde.valor, carga: recorde.valor, reps: recorde.reps, data: recorde.data },
    volume,
    series: quantas,
    repsMedia: quantas ? reps / quantas : 0,
  };
}

/** Exercícios já feitos, do mais feito ao menos feito. */
export function exerciciosFeitos(treinos: Treino[], exercicios: Exercicio[]): ResumoExercicio[] {
  const feitos = new Set(treinos.flatMap((t) => t.series.map((s) => s.exercicio_id)));
  return exercicios
    .filter((e) => feitos.has(e.id))
    .map((e) => resumoExercicio(e, treinos))
    .filter((r): r is ResumoExercicio => r !== null)
    .sort((a, b) => b.treinos - a.treinos || a.exercicio.nome.localeCompare(b.exercicio.nome));
}

export interface Recorde {
  exercicio: Exercicio;
  carga: number;
  reps: number;
  anterior: number;
  data: string;
}

/** Vezes em que a carga passou do maior valor anterior (a 1ª vez de cada exercício não conta).
 * Do mais novo ao mais antigo. */
export function recordes(resumos: ResumoExercicio[]): Recorde[] {
  const lista: Recorde[] = [];
  for (const r of resumos) {
    let maior = r.pontos[0]!.valor;
    for (const p of r.pontos.slice(1)) {
      if (p.valor > maior) lista.push({ exercicio: r.exercicio, carga: p.valor, reps: p.reps, anterior: maior, data: p.data });
      maior = Math.max(maior, p.valor);
    }
  }
  return lista.sort((a, b) => b.data.localeCompare(a.data) || b.carga - a.carga);
}

/** Exercício que mais subiu de carga (em %), entre os feitos pelo menos 3 vezes. */
export function maiorEvolucao(resumos: ResumoExercicio[]) {
  let melhor: { exercicio: Exercicio; de: number; para: number; ganho: number; fracao: number } | null = null;
  for (const r of resumos) {
    if (r.treinos < 3 || r.primeiro.valor <= 0) continue;
    const ganho = r.recorde.valor - r.primeiro.valor;
    const fracao = ganho / r.primeiro.valor;
    if (ganho > 0 && (!melhor || fracao > melhor.fracao)) {
      melhor = { exercicio: r.exercicio, de: r.primeiro.valor, para: r.recorde.valor, ganho, fracao };
    }
  }
  return melhor;
}

/** Séries por grupo muscular (a partir de `desde`, se informado), do mais ao menos treinado. */
export function seriesPorGrupo(treinos: Treino[], exercicios: Exercicio[], desde?: string): { grupo: string; series: number }[] {
  const grupo = new Map(exercicios.map((e) => [e.id, e.grupo_muscular]));
  const contagem = new Map<string, number>();
  for (const t of treinos) {
    if (desde && t.data < desde) continue;
    for (const s of t.series) {
      const g = grupo.get(s.exercicio_id) ?? "Outros";
      contagem.set(g, (contagem.get(g) ?? 0) + 1);
    }
  }
  return [...contagem].map(([g, series]) => ({ grupo: g, series })).sort((a, b) => b.series - a.series);
}

/** Quantas vezes cada ficha foi feita e quanto o treino dela costuma durar. */
export function treinosPorFicha(treinos: Treino[], fichas: Ficha[]): { ficha: Ficha; total: number; mediaMinutos: number | null }[] {
  return ativos(fichas)
    .map((ficha) => {
      const daFicha = treinos.filter((t) => t.sessao.ficha_id === ficha.id);
      const duracoes = daFicha.map((t) => t.minutos).filter((m): m is number => m !== null);
      return { ficha, total: daFicha.length, mediaMinutos: duracoes.length ? soma(duracoes) / duracoes.length : null };
    })
    .filter((f) => f.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** Quantas vezes um item da ficha foi feito com um exercício do Plano B. */
export function vezesPlanoB(treinos: Treino[], itens: FichaExercicio[]): number {
  const planejado = new Map(itens.map((i) => [i.id, i.exercicio_id]));
  let vezes = 0;
  for (const t of treinos) {
    const trocados = new Set(
      t.series
        .filter((s) => s.ficha_exercicio_id && planejado.has(s.ficha_exercicio_id) && planejado.get(s.ficha_exercicio_id) !== s.exercicio_id)
        .map((s) => s.ficha_exercicio_id),
    );
    vezes += trocados.size;
  }
  return vezes;
}

// --- Corpo -----------------------------------------------------------------------------------

export interface PontoPeso {
  data: string;
  t: number;
  peso: number;
  media7: number;
}

export function pontosDePeso(registros: RegistroDiario[]): PontoPeso[] {
  return pesoComMedia7(registros).map((p) => ({ ...p, t: Date.parse(`${p.data}T12:00:00`) }));
}

/** Quanto o peso muda por semana (kg), pela reta que melhor passa pelos pesos dos últimos `dias`.
 * Precisa de pelo menos 5 pesos espalhados por 10 dias ou mais. */
export function ritmoDoPeso(pontos: PontoPeso[], hoje: string, dias = 28): number | null {
  const desde = somarDias(hoje, -dias);
  const janela = pontos.filter((p) => p.data >= desde && p.data <= hoje);
  if (janela.length < 5 || diasEntre(janela[0]!.data, janela[janela.length - 1]!.data) < 10) return null;
  const xs = janela.map((p) => diasEntre(desde, p.data));
  const ys = janela.map((p) => p.peso);
  const mx = soma(xs) / xs.length;
  const my = soma(ys) / ys.length;
  const cov = soma(xs.map((x, i) => (x - mx) * (ys[i]! - my)));
  const varx = soma(xs.map((x) => (x - mx) ** 2));
  return varx ? (cov / varx) * 7 : null;
}

/** Em quantas semanas (e em que dia) chega na meta, no ritmo atual. Null se não está indo para lá. */
export function previsaoDaMeta(atual: number, meta: number, kgPorSemana: number | null, hoje: string): { semanas: number; data: string } | null {
  if (kgPorSemana === null || Math.abs(kgPorSemana) < 0.02) return null;
  const semanas = (meta - atual) / kgPorSemana;
  if (semanas <= 0 || semanas > 260) return null;
  return { semanas, data: somarDias(hoje, Math.round(semanas * 7)) };
}

/** Variação do peso médio de cada semana em relação à semana anterior com peso. */
export function variacaoPorSemana(pontos: PontoPeso[]): { semana: string; variacao: number }[] {
  const semanas = new Map<string, number[]>();
  for (const p of pontos) {
    const s = inicioDaSemana(p.data);
    semanas.set(s, [...(semanas.get(s) ?? []), p.peso]);
  }
  const medias = [...semanas].sort(([a], [b]) => a.localeCompare(b)).map(([semana, v]) => ({ semana, media: soma(v) / v.length }));
  return medias.slice(1).map((m, i) => ({ semana: m.semana, variacao: Math.round((m.media - medias[i]!.media) * 100) / 100 }));
}

export function imc(pesoKg: number, alturaCm: number): { valor: number; faixa: string } {
  const valor = pesoKg / (alturaCm / 100) ** 2;
  const faixa = valor < 18.5 ? "abaixo do peso" : valor < 25 ? "peso normal" : valor < 30 ? "sobrepeso" : "obesidade";
  return { valor, faixa };
}

export function extremosDoPeso(pontos: PontoPeso[]): { menor: PontoPeso; maior: PontoPeso } | null {
  if (!pontos.length) return null;
  return {
    menor: pontos.reduce((m, p) => (p.peso < m.peso ? p : m)),
    maior: pontos.reduce((m, p) => (p.peso > m.peso ? p : m)),
  };
}

// --- Alimentação e água ----------------------------------------------------------------------

export type CampoDoDia = "kcal" | "proteina_g" | "carbo_g" | "agua_ml";

const valorDo = (r: RegistroDiario, campo: CampoDoDia): number | null => r[campo] ?? null;

/** Valor de cada um dos últimos `dias` dias (null onde não lançou). */
export function porDia(registros: RegistroDiario[], campo: CampoDoDia, dias: number, hoje: string): { data: string; valor: number | null }[] {
  const porData = new Map(ativos(registros).map((r) => [r.data, valorDo(r, campo)]));
  return Array.from({ length: dias }, (_, i) => {
    const data = somarDias(hoje, i - dias + 1);
    return { data, valor: porData.get(data) ?? null };
  });
}

/** Média dos dias lançados em cada uma das últimas `semanas` semanas. */
export function mediaPorSemana(registros: RegistroDiario[], campo: CampoDoDia, semanas: number, hoje: string): { semana: string; valor: number | null; dias: number }[] {
  const grupos = new Map<string, number[]>();
  for (const r of ativos(registros)) {
    const v = valorDo(r, campo);
    if (v === null) continue;
    const s = inicioDaSemana(r.data);
    grupos.set(s, [...(grupos.get(s) ?? []), v]);
  }
  const ultima = inicioDaSemana(hoje);
  return Array.from({ length: semanas }, (_, i) => {
    const semana = somarDias(ultima, -7 * (semanas - 1 - i));
    const valores = grupos.get(semana) ?? [];
    return { semana, valor: valores.length ? soma(valores) / valores.length : null, dias: valores.length };
  });
}

/** Média dos dias lançados entre os últimos `dias` dias. */
export function mediaRecente(registros: RegistroDiario[], campo: CampoDoDia, dias: number, hoje: string): number | null {
  const valores = porDia(registros, campo, dias, hoje)
    .map((d) => d.valor)
    .filter((v): v is number => v !== null);
  return valores.length ? soma(valores) / valores.length : null;
}

/** Nos últimos `dias` dias: quantos foram lançados e quantos ficaram na meta. */
export function diasNaMeta(
  registros: RegistroDiario[],
  campo: CampoDoDia,
  dias: number,
  hoje: string,
  naMeta: (valor: number) => boolean,
): { na: number; lancados: number } {
  const valores = porDia(registros, campo, dias, hoje)
    .map((d) => d.valor)
    .filter((v): v is number => v !== null);
  return { na: valores.filter(naMeta).length, lancados: valores.length };
}

/** De onde vêm as calorias (média dos últimos `dias` dias com calorias, proteína e carbo
 * lançados): proteína e carbo têm 4 kcal por grama; o resto é gordura, álcool etc. */
export function origemDasCalorias(registros: RegistroDiario[], dias: number, hoje: string): { kcal: number; proteina: number; carbo: number; resto: number; dias: number } | null {
  const desde = somarDias(hoje, -dias + 1);
  const completos = ativos(registros).filter(
    (r) => r.data >= desde && r.data <= hoje && r.kcal && r.proteina_g !== null && (r.carbo_g ?? null) !== null,
  );
  if (!completos.length) return null;
  const media = (f: (r: RegistroDiario) => number) => soma(completos.map(f)) / completos.length;
  const kcal = media((r) => r.kcal!);
  const proteina = Math.min(kcal, media((r) => r.proteina_g! * 4));
  const carbo = Math.min(kcal - proteina, media((r) => r.carbo_g! * 4));
  return { kcal, proteina, carbo, resto: Math.max(0, kcal - proteina - carbo), dias: completos.length };
}

/** Somas de tudo o que já foi lançado. */
export function totaisDoDia(registros: RegistroDiario[]) {
  const lista = ativos(registros);
  const total = (campo: CampoDoDia) => soma(lista.map((r) => valorDo(r, campo) ?? 0));
  return { kcal: total("kcal"), proteina: total("proteina_g"), carbo: total("carbo_g"), agua: total("agua_ml"), dias: lista.length };
}

/** Desde o primeiro registro do dia: em quantos dias lançou alguma coisa. */
export function constanciaDoRegistro(registros: RegistroDiario[], hoje: string): { dias: number; lancados: number } | null {
  const datas = ativos(registros)
    .map((r) => r.data)
    .filter((d) => d <= hoje)
    .sort();
  if (!datas.length) return null;
  return { dias: diasEntre(datas[0]!, hoje) + 1, lancados: new Set(datas).size };
}

// --- Gráficos --------------------------------------------------------------------------------

/** Marcas redondas para um eixo (passos de 1, 2, 2,5 ou 5 × 10ⁿ) cobrindo de `min` a `max`. */
export function escala(min: number, max: number, divisoes = 4): { dominio: [number, number]; marcas: number[] } {
  const alto = max > min ? max : min + 1;
  const bruto = (alto - min) / divisoes;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto - 1e-9)!;
  const inicio = Math.floor(min / passo + 1e-9) * passo;
  const fim = Math.ceil(alto / passo - 1e-9) * passo;
  const marcas: number[] = [];
  for (let v = inicio; v <= fim + passo / 2; v += passo) marcas.push(Math.round(v * 1e6) / 1e6);
  return { dominio: [marcas[0]!, marcas[marcas.length - 1]!], marcas };
}
