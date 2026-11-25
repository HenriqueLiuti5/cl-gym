// Metas: onde a pessoa quer chegar. Peso e carga são destinos (o app comemora ao chegar e
// pergunta pela próxima); as outras valem para cada dia (ou semana, nos treinos).

import { agora, gravarMeta, lerMeta, salvar } from "./db";
import { formatarLitros, formatarNumero } from "./formato";
import { idMeta } from "./ids";
import { sincronizarEmBreve } from "./sync";
import type { Meta, TipoMeta } from "./tipos";

/** Os mesmos limites do servidor (LIMITES_META em backend/models.py): fora deles o envio seria
 * recusado e travaria a sincronização. */
export const LIMITES_META: Record<TipoMeta, { min: number; max: number }> = {
  peso: { min: 20, max: 500 },
  carga: { min: 0.5, max: 1000 },
  kcal: { min: 100, max: 20000 },
  proteina: { min: 1, max: 1000 },
  carbo: { min: 1, max: 2000 },
  agua: { min: 100, max: 20000 },
  treinos_semana: { min: 1, max: 14 },
};

/** Como cada meta aparece e é digitada. A água é guardada em ml e digitada em litros. */
export const INFO_META: Record<TipoMeta, { nome: string; unidade: string; fator: number; casas: number }> = {
  peso: { nome: "Peso", unidade: "kg", fator: 1, casas: 1 },
  carga: { nome: "Carga", unidade: "kg", fator: 1, casas: 2 },
  kcal: { nome: "Calorias", unidade: "kcal", fator: 1, casas: 0 },
  proteina: { nome: "Proteína", unidade: "g", fator: 1, casas: 0 },
  carbo: { nome: "Carboidrato", unidade: "g", fator: 1, casas: 0 },
  agua: { nome: "Água", unidade: "L", fator: 1000, casas: 1 },
  treinos_semana: { nome: "Treinos por semana", unidade: "", fator: 1, casas: 0 },
};

export const ehDestino = (tipo: TipoMeta) => tipo === "peso" || tipo === "carga";

/** Valor guardado → número na tela (ml → L na água). */
export const paraTela = (tipo: TipoMeta, valor: number) => valor / INFO_META[tipo].fator;
/** Número digitado → valor guardado. */
export const daTela = (tipo: TipoMeta, numero: number) => Math.round(numero * INFO_META[tipo].fator * 100) / 100;

/** "78 kg", "2.200 kcal", "3 L", "4 por semana". */
export function formatarMeta(tipo: TipoMeta, valor: number): string {
  if (tipo === "agua") return formatarLitros(valor);
  if (tipo === "treinos_semana") return `${formatarNumero(valor, 0)} por semana`;
  const { unidade, casas } = INFO_META[tipo];
  return `${formatarNumero(valor, casas)} ${unidade}`;
}

export function acharMeta(metas: Meta[] | undefined, tipo: TipoMeta, exercicioId: string | null = null): Meta | null {
  return metas?.find((m) => !m.excluido && m.tipo === tipo && (m.exercicio_id ?? null) === exercicioId) ?? null;
}

/** Problema do valor (já na unidade guardada), ou null se pode salvar. */
export function validarMeta(tipo: TipoMeta, valor: number | null): string | null {
  if (valor === null || !Number.isFinite(valor)) return "Digite um número.";
  const { min, max } = LIMITES_META[tipo];
  if (valor < min || valor > max) {
    return `Use um valor entre ${formatarMeta(tipo, min).replace(" por semana", "")} e ${formatarMeta(tipo, max).replace(" por semana", "")}.`;
  }
  if (tipo === "treinos_semana" && !Number.isInteger(valor)) return "Use um número inteiro.";
  return null;
}

/** Grava a meta no aparelho (funciona offline) e sincroniza em seguida. */
export async function salvarMeta(
  usuarioId: string,
  tipo: TipoMeta,
  valor: number,
  inicio: number | null,
  exercicioId: string | null = null,
): Promise<void> {
  const erro = validarMeta(tipo, valor);
  if (erro) throw new Error(erro);
  await salvar("metas", {
    id: idMeta(usuarioId, tipo, exercicioId),
    atualizado_em: agora(),
    excluido: false,
    tipo,
    exercicio_id: exercicioId,
    valor,
    // O servidor aceita de 0 a 20.000; fora disso (não deveria acontecer) fica sem partida.
    inicio: inicio !== null && inicio >= 0 && inicio <= 20000 ? Math.round(inicio * 100) / 100 : null,
  });
  sincronizarEmBreve();
}

export async function removerMeta(meta: Meta): Promise<void> {
  await salvar("metas", { ...meta, excluido: true });
  sincronizarEmBreve();
}

// --- Metas de destino (peso e carga) ---------------------------------------------------------

export interface PontoNoTempo {
  /** Momento do ponto (ms), para comparar com quando a meta foi definida. */
  t: number;
  valor: number;
}

export interface SituacaoMeta {
  meta: Meta;
  /** Último valor (peso, pela média de 7 dias) ou recorde (carga). */
  atual: number | null;
  partida: number | null;
  /** 1 = subir, −1 = descer, null = sem como saber (ainda sem dados). */
  sentido: 1 | -1 | null;
  /** Momento (ms) do primeiro ponto, depois de definida a meta, que chegou lá. */
  alcancadaEm: number | null;
  /** Fração do caminho da partida até a meta (0 a 1). */
  progresso: number | null;
  /** Quanto falta (0 quando chegou). */
  falta: number | null;
}

export function situacaoDestino(meta: Meta, pontos: PontoNoTempo[], atual: number | null): SituacaoMeta {
  const desde = Date.parse(meta.atualizado_em);
  // Sem `inicio` (meta definida antes de ter dados), parte do primeiro ponto depois dela.
  const partida = meta.inicio ?? pontos.find((p) => p.t >= desde)?.valor ?? null;
  let sentido: 1 | -1 | null = null;
  if (meta.tipo === "carga") sentido = 1;
  else if (partida !== null && partida !== meta.valor) sentido = meta.valor > partida ? 1 : -1;

  const chegou = (v: number) => (sentido === 1 ? v >= meta.valor : v <= meta.valor);
  const alcance = sentido === null ? undefined : pontos.find((p) => p.t >= desde && chegou(p.valor));
  const progresso =
    atual === null || partida === null || sentido === null || partida === meta.valor
      ? null
      : Math.min(1, Math.max(0, (atual - partida) / (meta.valor - partida)));
  return {
    meta,
    atual,
    partida,
    sentido,
    alcancadaEm: alcance?.t ?? null,
    progresso,
    falta: atual === null || sentido === null ? null : Math.max(0, sentido * (meta.valor - atual)),
  };
}

/** Próxima meta sugerida depois de chegar: carga ~5% acima (de 2,5 em 2,5 kg); peso 2 kg adiante. */
export function sugerirProxima(situacao: SituacaoMeta): number {
  const { meta, atual, sentido } = situacao;
  const base = Math.max(atual ?? meta.valor, meta.tipo === "carga" ? meta.valor : -Infinity);
  if (meta.tipo === "carga") return base + Math.max(2.5, Math.round((base * 0.05) / 2.5) * 2.5);
  const { min, max } = LIMITES_META.peso;
  return Math.min(max, Math.max(min, meta.valor + 2 * (sentido ?? -1)));
}

/** Muda quando a meta muda: uma meta nova (ou outro valor) comemora de novo. */
export const chaveComemoracao = (meta: Meta) => `${meta.id}@${meta.valor}`;

export async function lerComemoradas(): Promise<string[]> {
  return (await lerMeta<string[]>("metas_comemoradas")) ?? [];
}

/** Guarda (só neste aparelho) que a comemoração já foi vista. */
export async function marcarComemorada(chave: string): Promise<void> {
  const lista = await lerComemoradas();
  if (!lista.includes(chave)) await gravarMeta("metas_comemoradas", [...lista, chave]);
}

// --- Metas do dia a dia --------------------------------------------------------------------

/** Faixa aceita como "na meta" para calorias e carbo (proteína e água: chegar ao menos nela). */
export const TOLERANCIA = 0.1;

/** O valor do dia (ou da semana) está na meta? */
export function naMeta(tipo: TipoMeta, valor: number, meta: number): boolean {
  if (tipo === "kcal" || tipo === "carbo") return Math.abs(valor - meta) <= meta * TOLERANCIA;
  return valor >= meta;
}

/** Explicação curta do que conta como "na meta". */
export function regraDaMeta(tipo: TipoMeta): string {
  if (tipo === "kcal" || tipo === "carbo") return "Na meta = até 10% acima ou abaixo.";
  if (tipo === "treinos_semana") return "Na meta = fez pelo menos isso na semana.";
  return "Na meta = chegou pelo menos nela.";
}

/** Além dos limites: a meta de carga tem que passar do recorde (essa já foi), e a de peso tem
 * que ser diferente do peso de agora. `atual` na unidade guardada. */
export function problemaDaMeta(tipo: TipoMeta, valor: number | null, atual: number | null): string | null {
  const erro = validarMeta(tipo, valor);
  if (erro || valor === null) return erro;
  if (tipo === "carga" && atual !== null && valor <= atual) {
    return `Escolha mais que o seu recorde (${formatarMeta("carga", atual)}): esse você já levantou.`;
  }
  if (tipo === "peso" && atual !== null && Math.abs(valor - atual) < 0.1) return "Escolha um peso diferente do de agora.";
  return null;
}
