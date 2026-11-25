import { describe, expect, it } from "vitest";

import { deveMostrarInstalar, detectarPlataforma, ehSafari, type EstadoInstalacao } from "./instalar";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 Instagram 380.0.0.30.82",
  // iPad com iPadOS 13 ou mais novo: igual ao Safari do Mac.
  ipadOuMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
};

describe("detectarPlataforma", () => {
  it("reconhece iPhone em qualquer navegador", () => {
    expect(detectarPlataforma(UA.iphoneSafari)).toBe("ios");
    expect(detectarPlataforma(UA.iphoneChrome)).toBe("ios");
    expect(detectarPlataforma(UA.iphoneInstagram)).toBe("ios");
  });

  it("separa o iPad (com toque) do Mac (sem toque)", () => {
    expect(detectarPlataforma(UA.ipadOuMac, 5)).toBe("ios");
    expect(detectarPlataforma(UA.ipadOuMac, 0)).toBe("outro");
  });

  it("reconhece Android e trata o resto como computador", () => {
    expect(detectarPlataforma(UA.android, 5)).toBe("android");
    expect(detectarPlataforma(UA.windows)).toBe("outro");
  });
});

describe("ehSafari", () => {
  it("só o Safari de verdade, não o Chrome nem o navegador do Instagram", () => {
    expect(ehSafari(UA.iphoneSafari)).toBe(true);
    expect(ehSafari(UA.iphoneChrome)).toBe(false);
    expect(ehSafari(UA.iphoneInstagram)).toBe(false);
  });
});

describe("deveMostrarInstalar", () => {
  const estado = (campos: Partial<EstadoInstalacao> = {}): EstadoInstalacao => ({
    podePedir: false,
    aberturaInstalada: false,
    jaInstalou: false,
    ...campos,
  });

  it("nunca aparece dentro do app instalado", () => {
    expect(deveMostrarInstalar(estado({ aberturaInstalada: true, podePedir: true }), "android")).toBe(false);
    expect(deveMostrarInstalar(estado({ aberturaInstalada: true }), "ios")).toBe(false);
  });

  it("com o pedido nativo aparece em qualquer aparelho", () => {
    expect(deveMostrarInstalar(estado({ podePedir: true }), "outro")).toBe(true);
    expect(deveMostrarInstalar(estado({ podePedir: true, jaInstalou: true }), "android")).toBe(true);
  });

  it("sem o pedido nativo, só no celular e se ainda não instalou", () => {
    expect(deveMostrarInstalar(estado(), "ios")).toBe(true);
    expect(deveMostrarInstalar(estado(), "android")).toBe(true);
    expect(deveMostrarInstalar(estado(), "outro")).toBe(false);
    expect(deveMostrarInstalar(estado({ jaInstalou: true }), "android")).toBe(false);
  });
});
