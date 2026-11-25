import type { PontoPeso, ResumoExercicio, Treino } from "../../lib/estatisticas";
import type { Exercicio, Ficha, FichaExercicio, Meta, RegistroDiario, Usuario } from "../../lib/tipos";
import type { PedidoDeMeta } from "./Metas";

/** Tudo o que as abas da Evolução usam, lido e calculado uma vez na tela. */
export interface DadosEvolucao {
  usuario: Usuario;
  /** AAAA-MM-DD no fuso do aparelho. */
  hoje: string;
  exercicios: Exercicio[];
  fichas: Ficha[];
  itens: FichaExercicio[];
  registros: RegistroDiario[];
  metas: Meta[];
  treinos: Treino[];
  /** Exercícios já feitos, do mais feito ao menos feito. */
  resumos: ResumoExercicio[];
  pesos: PontoPeso[];
  editarMeta: (pedido: PedidoDeMeta) => void;
}

export const dataCurta = { day: "2-digit", month: "2-digit" } as const;
export const dataLonga = { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" } as const;
