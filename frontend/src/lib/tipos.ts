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
  /**
   * Exercícios parecidos (ids, do mais parecido ao menos), vindos do catálogo: são a sugestão de
   * Plano B ao montar um treino e as opções de troca durante o treino. Falta nos registros baixados
   * antes de o campo existir: trate como [].
   */
  substitutos?: string[];
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
  /** Os dois abaixo faltam nos registros gravados antes de existirem: trate como null. */
  carbo_g?: number | null;
  agua_ml?: number | null;
  observacao: string | null;
}

/** Peso e carga são destinos (o app comemora ao chegar); os outros valem por dia ou semana. */
export type TipoMeta = "peso" | "carga" | "kcal" | "proteina" | "carbo" | "agua" | "treinos_semana";

export interface Meta extends Sincronizavel {
  tipo: TipoMeta;
  /** Só nas metas de carga. */
  exercicio_id: string | null;
  /** kg (peso, carga), kcal, g (proteína, carbo), ml (água) ou treinos por semana. */
  valor: number;
  /** De onde a pessoa partiu (peso ou recorde quando definiu a meta): sentido e progresso. */
  inicio: number | null;
}

export interface Usuario {
  id: string;
  email: string;
  nome: string | null;
  criado_em: string;
  altura_cm: number | null;
  idade: number | null;
  /** Só a conta do ADMIN_EMAIL (variável da Vercel) vê a área de administração. */
  admin?: boolean;
}

/** Por que o app saiu da conta sozinho (meta "saida"); a tela de login explica. */
export interface Saida {
  motivo: "sessao-expirada" | "conta-apagada" | "bloqueado";
  /** Frase do servidor, quando houver. */
  mensagem?: string;
}

export const TABELAS = [
  "exercicios",
  "fichas",
  "ficha_exercicios",
  "sessoes",
  "series",
  "registros_diarios",
  "metas",
] as const;

export type NomeTabela = (typeof TABELAS)[number];

export interface Registros {
  exercicios: Exercicio;
  fichas: Ficha;
  ficha_exercicios: FichaExercicio;
  sessoes: Sessao;
  series: Serie;
  registros_diarios: RegistroDiario;
  metas: Meta;
}
