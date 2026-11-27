// Linha de uma série na tela do treino (kg e reps): leitura dos campos, limites e quando a série
// que volta do banco deve reescrever os campos. A série é gravada sozinha a cada mudança.

import { lerNumero } from "./formato";

/** Mesmos limites do servidor (SerieBase): um valor fora deles seria recusado (422) e travaria
 * os envios seguintes. */
export const CARGA_MAX = 1000;
export const REPS_MAX = 1000;
export const NUMERO_MAX = 50;

export interface CamposSerie {
  /** Preenchido e fora dos limites. Vazio não é erro: só não grava. */
  cargaInvalida: boolean;
  repsInvalida: boolean;
  /** Os dois preenchidos e dentro dos limites: o que gravar. */
  valores: { carga: number; reps: number } | null;
}

export function lerCampos(cargaTexto: string, repsTexto: string): CamposSerie {
  const carga = lerNumero(cargaTexto);
  const reps = lerNumero(repsTexto);
  const cargaOk = carga !== null && carga >= 0 && carga <= CARGA_MAX;
  const repsOk = reps !== null && Number.isInteger(reps) && reps >= 0 && reps <= REPS_MAX;
  return {
    cargaInvalida: cargaTexto.trim() !== "" && !cargaOk,
    repsInvalida: repsTexto.trim() !== "" && !repsOk,
    valores: cargaOk && repsOk ? { carga, reps } : null,
  };
}

/** Carga como texto do campo: 22.5 → "22,5". */
export const textoCarga = (kg: number) => String(kg).replace(".", ",");

/**
 * A série voltou do banco com `atualizadoEm`: é mudança de fora (outro aparelho, sincronização)
 * ou eco de uma gravação desta linha? A linha grava com a própria hora (`gravadaEm`, a da última
 * gravação dela), então o que não é mais novo que isso é eco, talvez de uma gravação já superada
 * pelo que foi digitado depois, e não pode reescrever os campos.
 */
export function mudouPorFora(atualizadoEm: string, gravadaEm: string | null): boolean {
  return gravadaEm === null || Date.parse(atualizadoEm) > Date.parse(gravadaEm);
}
