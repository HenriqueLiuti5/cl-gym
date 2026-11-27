import { describe, expect, it } from "vitest";

import {
  avisoProgressao,
  evolucao,
  inicioDaSemana,
  mediasSemanais,
  pesoComMedia7,
  treinosFeitos,
  ultimaVez,
} from "./regras";
import type { RegistroDiario, Serie, Sessao } from "./tipos";

const base = { atualizado_em: "2026-11-01T00:00:00Z", excluido: false };

const sessao = (id: string, fichaId: string | null, quando: string, finalizada = true): Sessao => ({
  ...base,
  id,
  ficha_id: fichaId,
  iniciada_em: quando,
  finalizada_em: finalizada ? quando : null,
  observacao: null,
});

const serie = (
  sessaoId: string,
  exercicioId: string,
  numero: number,
  carga: number,
  reps: number,
): Serie => ({
  ...base,
  id: `${sessaoId}-${exercicioId}-${numero}`,
  sessao_id: sessaoId,
  exercicio_id: exercicioId,
  ficha_exercicio_id: null,
  numero,
  carga_kg: carga,
  repeticoes: reps,
});

const dia = (data: string, campos: Partial<RegistroDiario>): RegistroDiario => ({
  ...base,
  id: data,
  data,
  peso_kg: null,
  kcal: null,
  proteina_g: null,
  observacao: null,
  ...campos,
});

describe("treinos feitos", () => {
  it("conta só os treinos terminados", () => {
    expect(
      treinosFeitos([
        sessao("a", "push", "2026-11-17T20:00:00Z"),
        sessao("b", "push", "2026-11-18T20:00:00Z", false),
        { ...sessao("c", "push", "2026-11-19T20:00:00Z"), excluido: true },
      ]),
    ).toBe(1);
  });
});

describe("última vez e progressão", () => {
  const sessoes = [
    sessao("antiga", "push", "2026-11-10T20:00:00Z"),
    sessao("recente", "push", "2026-11-17T20:00:00Z"),
    sessao("hoje", "push", "2026-11-24T20:00:00Z", false),
  ];
  const series = [
    serie("antiga", "supino", 1, 18, 8),
    serie("recente", "supino", 2, 20, 7),
    serie("recente", "supino", 1, 20, 8),
    serie("hoje", "supino", 1, 22, 6),
    serie("recente", "crucifixo", 1, 14, 8),
  ];

  it("pega a sessão mais recente fora a atual, em ordem de série", () => {
    const ultima = ultimaVez("supino", series, sessoes, "hoje");
    expect(ultima?.sessao.id).toBe("recente");
    expect(ultima?.series.map((s) => [s.carga_kg, s.repeticoes])).toEqual([
      [20, 8],
      [20, 7],
    ]);
    expect(ultimaVez("nunca-feito", series, sessoes)).toBeNull();
  });

  it("sobe o peso quando a 1ª série fez alvo + 2", () => {
    expect(avisoProgressao(8, [serie("x", "e", 1, 20, 10), serie("x", "e", 2, 20, 9)])).toEqual({
      sobe: true,
      pesado: false,
    });
    expect(avisoProgressao(8, [serie("x", "e", 1, 20, 9)]).sobe).toBe(false);
  });

  it("pesado demais quando alguma série ficou 2 abaixo do alvo", () => {
    expect(avisoProgressao(10, [serie("x", "e", 1, 20, 9), serie("x", "e", 2, 20, 8)])).toEqual({
      sobe: false,
      pesado: true,
    });
    expect(avisoProgressao(10, []).pesado).toBe(false);
  });

  it("evolução usa a maior carga de cada sessão", () => {
    expect(evolucao("supino", series, sessoes).map((p) => p.valor)).toEqual([18, 20, 22]);
  });
});

describe("peso e alimentação", () => {
  it("média de 7 dias só com os dias pesados", () => {
    const pontos = pesoComMedia7([
      dia("2026-11-01", { peso_kg: 80 }),
      dia("2026-11-03", { peso_kg: 79 }),
      dia("2026-11-04", { kcal: 2000 }),
      dia("2026-11-08", { peso_kg: 78 }),
    ]);
    expect(pontos.map((p) => p.media7)).toEqual([80, 79.5, 78.5]);
  });

  it("semana começa na segunda", () => {
    expect(inicioDaSemana("2026-11-24")).toBe("2026-11-23"); // terça → segunda
    expect(inicioDaSemana("2026-11-29")).toBe("2026-11-23"); // domingo → segunda anterior
    expect(inicioDaSemana("2026-11-23")).toBe("2026-11-23");
  });

  it("média semanal de kcal e proteína", () => {
    expect(
      mediasSemanais([
        dia("2026-11-23", { kcal: 2000, proteina_g: 120 }),
        dia("2026-11-24", { kcal: 2400 }),
        dia("2026-11-30", { proteina_g: 150 }),
      ]),
    ).toEqual([
      { semana: "2026-11-23", kcal: 2200, proteina: 120 },
      { semana: "2026-11-30", kcal: null, proteina: 150 },
    ]);
  });
});
