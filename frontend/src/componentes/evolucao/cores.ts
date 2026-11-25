// Cores dos dados da Evolução: uma cor por assunto, a mesma em todos os gráficos.
// Os valores ficam em src/index.css (--color-g-*), um conjunto para o tema claro e outro para o
// escuro, ambos validados (contraste e daltonismo) contra a superfície dos cartões.

export const COR = {
  treino: "var(--color-g-treino)",
  peso: "var(--color-g-peso)",
  kcal: "var(--color-g-kcal)",
  proteina: "var(--color-g-proteina)",
  carbo: "var(--color-g-carbo)",
  agua: "var(--color-g-agua)",
  // Variação do peso (divergente): desceu × subiu.
  desceu: "var(--color-g-desceu)",
  subiu: "var(--color-g-subiu)",
  /** O alvo da meta: tinta do texto, diferente de qualquer dado. */
  meta: "var(--color-texto)",
  /** Meta alcançada (sempre junto do visto desenhado e de texto). */
  alcancada: "var(--color-g-alcancada)",
  /** Contexto recessivo (ex.: o peso de cada dia atrás da média). */
  contexto: "var(--color-g-contexto)",
  grade: "var(--color-g-grade)",
  eixo: "var(--color-g-eixo)",
  base: "var(--color-g-base)",
  /** Dia sem treino no calendário. */
  vazio: "var(--color-g-vazio)",
  /** Faixa atrás da barra tocada. */
  cursor: "var(--color-g-cursor)",
  superficie: "var(--color-superficie)",
  texto: "var(--color-texto)",
} as const;
