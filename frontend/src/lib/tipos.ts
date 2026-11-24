// Espelho dos esquemas do backend (backend/models.py). Datas em texto ISO 8601 com fuso.

export interface Sincronizavel {
  id: string;
  atualizado_em: string;
  excluido: boolean;
  /** Só no aparelho: 1 = ainda não foi enviado ao servidor. */
  pendente?: 0 | 1;
  versao?: number;
}

export interface Exercicio extends Sincronizavel {
  nome: string;
  grupo_muscular: string;
  imagens: string[];
  instrucoes: string[];
  midia_url: string | null;
  /** null = catálogo (só leitura). */
  usuario_id?: string | null;
}

export interface Ficha extends Sincronizavel {
  nome: string;
  ordem: number;
}

export interface FichaExercicio extends Sincronizavel {
  ficha_id: string;
  exercicio_id: string;
  ordem: number;
  series: number;
  alvo_reps: number;
  aquecimento: boolean;
  grupo_biset: number | null;
  alternativas: string[];
  observacao: string | null;
}

export interface Sessao extends Sincronizavel {
  ficha_id: string | null;
  iniciada_em: string;
  finalizada_em: string | null;
  observacao: string | null;
}

export interface Serie extends Sincronizavel {
  sessao_id: string;
  exercicio_id: string;
  ficha_exercicio_id: string | null;
  numero: number;
  carga_kg: number;
  repeticoes: number;
}

export interface RegistroDiario extends Sincronizavel {
  /** AAAA-MM-DD, no fuso do aparelho. */
  data: string;
  peso_kg: number | null;
  kcal: number | null;
  proteina_g: number | null;
  observacao: string | null;
}

export interface Usuario {
  id: string;
  email: string;
  nome: string | null;
  criado_em: string;
  meta_kcal: number | null;
  meta_proteina_g: number | null;
  meta_peso_kg: number | null;
}

export const TABELAS = [
  "exercicios",
  "fichas",
  "ficha_exercicios",
  "sessoes",
  "series",
  "registros_diarios",
] as const;

export type NomeTabela = (typeof TABELAS)[number];

export interface Registros {
  exercicios: Exercicio;
  fichas: Ficha;
  ficha_exercicios: FichaExercicio;
  sessoes: Sessao;
  series: Serie;
  registros_diarios: RegistroDiario;
}
