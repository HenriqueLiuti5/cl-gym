import { describe, expect, it } from "vitest";

import {
  acharMeta,
  chaveComemoracao,
  daTela,
  formatarMeta,
  naMeta,
  paraTela,
  problemaDaMeta,
  situacaoDestino,
  sugerirProxima,
  validarMeta,
  type PontoNoTempo,
} from "./metas";
import type { Meta, TipoMeta } from "./tipos";

const DEFINIDA = "2026-10-01T10:00:00Z";
const t = (data: string) => Date.parse(`${data}T12:00:00Z`);

const meta = (tipo: TipoMeta, valor: number, inicio: number | null = null, campos: Partial<Meta> = {}): Meta => ({
  id: `${tipo}-1`,
  atualizado_em: DEFINIDA,
  excluido: false,
  tipo,
  exercicio_id: tipo === "carga" ? "supino" : null,
  valor,
  inicio,
  ...campos,
});

const pontos = (...valores: [string, number][]): PontoNoTempo[] => valores.map(([data, valor]) => ({ t: t(data), valor }));

describe("validarMeta", () => {
  it("segue os limites do servidor", () => {
    expect(validarMeta("peso", 78)).toBeNull();
    expect(validarMeta("peso", 10)).toMatch(/entre 20 kg e 500 kg/);
    expect(validarMeta("agua", 50)).toMatch(/0,1 L/);
    expect(validarMeta("treinos_semana", 3.5)).toBe("Use um número inteiro.");
    expect(validarMeta("kcal", null)).toBe("Digite um número.");
    expect(validarMeta("kcal", Number.NaN)).toBe("Digite um número.");
  });
});

describe("unidades", () => {
  it("água é digitada em litros e guardada em ml", () => {
    expect(daTela("agua", 2.5)).toBe(2500);
    expect(paraTela("agua", 3000)).toBe(3);
    expect(formatarMeta("agua", 3000)).toBe("3 L");
    expect(formatarMeta("kcal", 2200)).toBe("2.200 kcal");
    expect(formatarMeta("treinos_semana", 4)).toBe("4 por semana");
  });
});

describe("acharMeta", () => {
  it("acha pelo tipo e exercício, ignorando excluídas", () => {
    const metas = [meta("carga", 80), meta("peso", 78), meta("kcal", 2000, null, { excluido: true })];
    expect(acharMeta(metas, "carga", "supino")?.valor).toBe(80);
    expect(acharMeta(metas, "carga", "leg")).toBeNull();
    expect(acharMeta(metas, "peso")?.valor).toBe(78);
    expect(acharMeta(metas, "kcal")).toBeNull();
  });
});

describe("situacaoDestino", () => {
  it("peso para baixo: progresso, quanto falta e quando chegou", () => {
    const m = meta("peso", 78, 84);
    const caminho = situacaoDestino(m, pontos(["2026-10-02", 83.5], ["2026-11-01", 80]), 80);
    expect(caminho.sentido).toBe(-1);
    expect(caminho.progresso).toBeCloseTo(4 / 6);
    expect(caminho.falta).toBe(2);
    expect(caminho.alcancadaEm).toBeNull();

    const chegou = situacaoDestino(m, pontos(["2026-10-02", 83.5], ["2026-11-20", 77.9]), 77.9);
    expect(chegou.alcancadaEm).toBe(t("2026-11-20"));
    expect(chegou.progresso).toBe(1);
    expect(chegou.falta).toBe(0);
  });

  it("peso para cima (ganhar massa)", () => {
    const s = situacaoDestino(meta("peso", 70, 65), pontos(["2026-11-01", 70.2]), 70.2);
    expect(s.sentido).toBe(1);
    expect(s.alcancadaEm).toBe(t("2026-11-01"));
  });

  it("sem partida guardada, parte do primeiro ponto depois da meta", () => {
    const s = situacaoDestino(meta("peso", 78), pontos(["2026-09-01", 90], ["2026-10-05", 82], ["2026-11-01", 80]), 80);
    expect(s.partida).toBe(82);
    expect(s.progresso).toBeCloseTo(0.5);
  });

  it("carga sempre sobe e só conta o que veio depois de definir a meta", () => {
    const m = meta("carga", 80, 70);
    const antes = pontos(["2026-09-15", 82.5], ["2026-10-10", 75]);
    expect(situacaoDestino(m, antes, 82.5).alcancadaEm).toBeNull();
    const depois = situacaoDestino(m, pontos(["2026-10-10", 75], ["2026-10-20", 80]), 80);
    expect(depois.alcancadaEm).toBe(t("2026-10-20"));
  });

  it("sem dados não sabe o sentido nem comemora", () => {
    const s = situacaoDestino(meta("peso", 78), [], null);
    expect([s.sentido, s.alcancadaEm, s.progresso, s.falta]).toEqual([null, null, null, null]);
  });
});

describe("sugerirProxima", () => {
  it("carga: ~5% acima, de 2,5 em 2,5 kg", () => {
    expect(sugerirProxima(situacaoDestino(meta("carga", 80, 70), [], 80))).toBe(85);
    expect(sugerirProxima(situacaoDestino(meta("carga", 20, 15), [], 20))).toBe(22.5);
  });

  it("peso: mais 2 kg no mesmo sentido", () => {
    expect(sugerirProxima(situacaoDestino(meta("peso", 78, 84), [], 77.8))).toBe(76);
    expect(sugerirProxima(situacaoDestino(meta("peso", 70, 65), [], 70.1))).toBe(72);
  });
});

describe("naMeta", () => {
  it("calorias e carbo perto da meta; proteína e água ao menos nela", () => {
    expect(naMeta("kcal", 2350, 2200)).toBe(true);
    expect(naMeta("kcal", 1900, 2200)).toBe(false);
    expect(naMeta("carbo", 260, 230)).toBe(false);
    expect(naMeta("proteina", 150, 150)).toBe(true);
    expect(naMeta("agua", 2900, 3000)).toBe(false);
  });
});

describe("chaveComemoracao", () => {
  it("muda com o valor, para uma meta nova comemorar de novo", () => {
    expect(chaveComemoracao(meta("carga", 80))).not.toBe(chaveComemoracao(meta("carga", 85)));
  });
});

describe("problemaDaMeta", () => {
  it("carga passa do recorde; peso diferente do atual", () => {
    expect(problemaDaMeta("carga", 80, 80)).toMatch(/mais que o seu recorde \(80 kg\)/);
    expect(problemaDaMeta("carga", 82.5, 80)).toBeNull();
    expect(problemaDaMeta("peso", 80.02, 80)).toMatch(/diferente/);
    expect(problemaDaMeta("peso", 78, 80)).toBeNull();
    expect(problemaDaMeta("kcal", 50, null)).toMatch(/entre/);
  });
});
