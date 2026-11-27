// Opções da janela "Trocar exercício" do treino: o exercício planejado, o Plano B do item e os
// substitutos do catálogo (veja "Trocar" em "Regras de negócio" no CLAUDE.md).

import { formatarNumero } from "./formato";
import type { UltimaVez } from "./regras";
import type { Exercicio, FichaExercicio } from "./tipos";

export type OrigemOpcao = "planejado" | "planoB" | "substituto";

export interface OpcaoTroca {
  exercicio: Exercicio;
  origem: OrigemOpcao;
}

/**
 * O planejado, o Plano B do item (na ordem da ficha) e os substitutos do planejado (do mais
 * parecido ao menos), sem repetir e sem os que não estão no banco local ou foram excluídos.
 */
export function opcoesDeTroca(
  item: Pick<FichaExercicio, "exercicio_id" | "alternativas">,
  exercicios: ReadonlyMap<string, Exercicio>,
): OpcaoTroca[] {
  const candidatos: [string, OrigemOpcao][] = [
    [item.exercicio_id, "planejado"],
    ...item.alternativas.map((id): [string, OrigemOpcao] => [id, "planoB"]),
    ...(exercicios.get(item.exercicio_id)?.substitutos ?? []).map((id): [string, OrigemOpcao] => [id, "substituto"]),
  ];
  const vistos = new Set<string>();
  const opcoes: OpcaoTroca[] = [];
  for (const [id, origem] of candidatos) {
    const exercicio = exercicios.get(id);
    if (!exercicio || exercicio.excluido || vistos.has(id)) continue;
    vistos.add(id);
    opcoes.push({ exercicio, origem });
  }
  return opcoes;
}

/** O botão "Trocar" só aparece se houver para onde trocar. */
export function podeTrocar(opcoes: OpcaoTroca[], atual: string): boolean {
  return opcoes.some((o) => o.exercicio.id !== atual);
}

/** "Última vez: 40 kg × 8" (a 1ª série: o peso é o mesmo em todas), ou null se nunca foi feito. */
export function resumoUltimaVez(ultima: UltimaVez | null): string | null {
  const primeira = ultima?.series[0];
  if (!primeira) return null;
  return `Última vez: ${formatarNumero(primeira.carga_kg, 2)} kg × ${primeira.repeticoes}`;
}
