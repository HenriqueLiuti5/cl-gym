import { describe, expect, it } from "vitest";

import { lerCampos, mudouPorFora, textoCarga } from "./linhaSerie";

describe("lerCampos", () => {
  it("kg e reps preenchidos e válidos: grava", () => {
    expect(lerCampos("22,5", "8")).toEqual({ cargaInvalida: false, repsInvalida: false, valores: { carga: 22.5, reps: 8 } });
    expect(lerCampos(" 40 ", "10")).toMatchObject({ valores: { carga: 40, reps: 10 } });
    expect(lerCampos("0", "0")).toMatchObject({ valores: { carga: 0, reps: 0 } });
    expect(lerCampos("1000", "1000")).toMatchObject({ valores: { carga: 1000, reps: 1000 } });
  });

  it("vírgula no fim, no meio da digitação, já vale o número", () => {
    expect(lerCampos("22,", "8")).toMatchObject({ valores: { carga: 22, reps: 8 } });
  });

  it("faltando um dos dois: não grava, mas não é erro", () => {
    expect(lerCampos("40", "")).toEqual({ cargaInvalida: false, repsInvalida: false, valores: null });
    expect(lerCampos("", "8")).toEqual({ cargaInvalida: false, repsInvalida: false, valores: null });
    expect(lerCampos("  ", " ")).toEqual({ cargaInvalida: false, repsInvalida: false, valores: null });
  });

  it("fora dos limites do servidor: erro no campo e não grava", () => {
    expect(lerCampos("1000,5", "8")).toEqual({ cargaInvalida: true, repsInvalida: false, valores: null });
    expect(lerCampos("-5", "8")).toMatchObject({ cargaInvalida: true, valores: null });
    expect(lerCampos("abc", "8")).toMatchObject({ cargaInvalida: true, valores: null });
    expect(lerCampos("40", "1001")).toEqual({ cargaInvalida: false, repsInvalida: true, valores: null });
    expect(lerCampos("40", "-1")).toMatchObject({ repsInvalida: true, valores: null });
  });

  it("reps só inteiras", () => {
    expect(lerCampos("40", "8,5")).toEqual({ cargaInvalida: false, repsInvalida: true, valores: null });
    expect(lerCampos("40", "8,")).toMatchObject({ repsInvalida: false, valores: { carga: 40, reps: 8 } });
  });
});

describe("textoCarga", () => {
  it("vírgula no lugar do ponto", () => {
    expect(textoCarga(22.5)).toBe("22,5");
    expect(textoCarga(40)).toBe("40");
  });
});

describe("mudouPorFora", () => {
  const minha = "2026-11-26T10:00:05.000Z";

  it("linha que ainda não gravou: toda série que chega é de fora", () => {
    expect(mudouPorFora("2026-11-26T09:00:00.000Z", null)).toBe(true);
  });

  it("eco da última gravação desta linha ou de uma anterior: não é de fora", () => {
    expect(mudouPorFora(minha, minha)).toBe(false);
    expect(mudouPorFora("2026-11-26T10:00:04.700Z", minha)).toBe(false);
  });

  it("mais nova que a gravação desta linha: outro aparelho mudou", () => {
    expect(mudouPorFora("2026-11-26T10:00:05.001Z", minha)).toBe(true);
  });

  it("compara a hora, não o texto (o servidor devolve em outro formato)", () => {
    expect(mudouPorFora("2026-11-26T10:00:05+00:00", minha)).toBe(false);
    expect(mudouPorFora("2026-11-26T07:00:06-03:00", minha)).toBe(true);
  });
});
