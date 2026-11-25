// Ordem das telas para trocar arrastando o dedo para o lado, como num app, e o lado de onde a tela
// nova entra (ao arrastar, ao tocar numa aba ou ao entrar e sair de uma tela interna).
// A lógica do gesto fica em componentes/Palco.tsx; aqui só o que dá para testar sem tela.

/** Partes da Evolução (#/graficos/<id>), na ordem dos segmentos. */
export const PARTES_EVOLUCAO = [
  { id: "treino", rotulo: "Treino" },
  { id: "corpo", rotulo: "Corpo" },
  { id: "nutricao", rotulo: "Nutrição" },
  { id: "curiosidades", rotulo: "Curiosidades" },
];

/** Partes da administração (#/admin/<id>). */
export const PARTES_ADMIN = [
  { id: "usuarios", rotulo: "Usuários" },
  { id: "convites", rotulo: "Convites" },
];

/**
 * Telas que se trocam arrastando, na ordem em que aparecem. As partes da Evolução ficam entre o
 * Dia e a Conta, como as abas de cima dentro das de baixo num app de Android: o arrasto passa por
 * elas antes de ir para a aba seguinte.
 */
const GRUPOS: string[][] = [
  ["", "dia", ...PARTES_EVOLUCAO.map((p) => `graficos/${p.id}`), "conta"],
  PARTES_ADMIN.map((p) => `admin/${p.id}`),
];

/** Telas internas, abertas a partir de uma aba; o treino é aberto a partir da ficha. */
const PROFUNDIDADE: Record<string, number> = { ficha: 1, admin: 1, treino: 2 };

/** A rota sem o que não muda a tela: "#/graficos" é a parte Treino; o id da ficha não conta. */
export function chaveDaRota(rota: string[]): string {
  const [tela = "", parte] = rota;
  if (tela === "graficos") return `graficos/${PARTES_EVOLUCAO.find((p) => p.id === parte)?.id ?? PARTES_EVOLUCAO[0]!.id}`;
  if (tela === "admin") return `admin/${PARTES_ADMIN.find((p) => p.id === parte)?.id ?? PARTES_ADMIN[0]!.id}`;
  return tela;
}

/**
 * A tela ao lado, para onde o arrasto leva: `lado` 1 é a da direita (o dedo vai para a esquerda),
 * -1 a da esquerda. Devolve o endereço sem o "#/" ou null se não houver.
 */
export function telaVizinha(rota: string[], lado: 1 | -1): string | null {
  const chave = chaveDaRota(rota);
  for (const grupo of GRUPOS) {
    const i = grupo.indexOf(chave);
    if (i >= 0) return grupo[i + lado] ?? null;
  }
  return null;
}

/**
 * De que lado a tela nova entra: 1 pela direita (avançou: aba seguinte ou tela interna), -1 pela
 * esquerda (voltou) e 0 sem deslizar (mesma tela ou telas sem ordem entre si).
 */
export function sentidoDaTransicao(de: string[], para: string[]): -1 | 0 | 1 {
  const a = chaveDaRota(de);
  const b = chaveDaRota(para);
  if (a === b) return 0;
  const profundidadeDe = PROFUNDIDADE[de[0] ?? ""] ?? 0;
  const profundidadePara = PROFUNDIDADE[para[0] ?? ""] ?? 0;
  if (profundidadeDe !== profundidadePara) return profundidadePara > profundidadeDe ? 1 : -1;
  for (const grupo of GRUPOS) {
    const i = grupo.indexOf(a);
    const j = grupo.indexOf(b);
    if (i >= 0 && j >= 0) return j > i ? 1 : -1;
  }
  return 0;
}

/** Mesma tela com outra parte (Corpo → Nutrição): só o miolo desliza, o topo e os segmentos ficam. */
export function mesmaTela(de: string[], para: string[]): boolean {
  return (de[0] ?? "") === (para[0] ?? "");
}

/** Ao soltar o dedo: troca se arrastou mais de um quarto da largura ou num movimento rápido. */
export function deveTrocar(deslocamento: number, largura: number, velocidade: number): boolean {
  if (Math.abs(deslocamento) > largura / 4) return true;
  // Velocidade em px/ms, no mesmo sentido do arrasto.
  return Math.abs(deslocamento) > 40 && Math.abs(velocidade) > 0.4 && Math.sign(velocidade) === Math.sign(deslocamento);
}

/** Sem tela daquele lado: a tela anda bem menos que o dedo e volta ao soltar (efeito elástico). */
export function comResistencia(deslocamento: number): number {
  return deslocamento / 4;
}
