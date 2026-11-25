import { describe, expect, it } from "vitest";

import { codigoCompleto, formatarCodigo, linkDoConvite, normalizarCodigo, quandoVence } from "./convite";

describe("código do convite", () => {
  it("aceita minúsculas, espaços e hífen", () => {
    expect(normalizarCodigo(" 7kqm x4pd ")).toBe("7KQMX4PD");
    expect(normalizarCodigo("7KQM-X4PD")).toBe("7KQMX4PD");
  });

  it("acha o código numa mensagem colada inteira", () => {
    expect(normalizarCodigo("Código do convite do CL Gym: 7KQM-X4PD (vale até amanhã)")).toBe("7KQMX4PD");
  });

  it("formata com o hífen no meio, também pela metade", () => {
    expect(formatarCodigo("7kqm")).toBe("7KQM");
    expect(formatarCodigo("7kqmx")).toBe("7KQM-X");
    expect(formatarCodigo("7kqmx4pd9")).toBe("7KQM-X4PD");
  });

  it("só é completo com 8 caracteres do alfabeto", () => {
    expect(codigoCompleto("7KQM-X4PD")).toBe(true);
    expect(codigoCompleto("7KQM-X4P")).toBe(false);
    // 0, O, 1, I e L não existem no alfabeto (se confundem).
    expect(codigoCompleto("7KQM-X4P0")).toBe(false);
    expect(codigoCompleto("7KQM-X4PL")).toBe(false);
  });

  it("monta o link da tela do convite", () => {
    expect(linkDoConvite("abc", "https://cl-gym.vercel.app")).toBe("https://cl-gym.vercel.app/#/convite/abc");
  });
});

describe("quandoVence", () => {
  // Datas no horário local do aparelho, como o app mostra.
  const agora = new Date(2026, 10, 25, 10, 0);

  it("diz hoje ou amanhã com a hora", () => {
    expect(quandoVence(new Date(2026, 10, 25, 18, 42).toISOString(), agora)).toBe("hoje, 18:42");
    expect(quandoVence(new Date(2026, 10, 26, 9, 5).toISOString(), agora)).toBe("amanhã, 09:05");
  });

  it("mais longe, mostra o dia", () => {
    expect(quandoVence(new Date(2026, 10, 27, 18, 42).toISOString(), agora)).toBe("27/11, 18:42");
  });
});
