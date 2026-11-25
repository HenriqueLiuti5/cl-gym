import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apagarConvitePendente, guardarConvitePendente, lerConvitePendente } from "./convitePendente";

const AGORA = Date.parse("2026-11-25T12:00:00Z");

beforeEach(() => {
  const dados = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => void dados.set(chave, valor),
    removeItem: (chave: string) => void dados.delete(chave),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("convite pendente", () => {
  it("guarda e devolve enquanto vale", () => {
    guardarConvitePendente({ codigo: "7KQMX4PD", expira_em: "2026-11-26T12:00:00Z" });
    expect(lerConvitePendente(AGORA)).toEqual({ codigo: "7KQMX4PD", expira_em: "2026-11-26T12:00:00Z" });
    apagarConvitePendente();
    expect(lerConvitePendente(AGORA)).toBeNull();
  });

  it("apaga o que já venceu", () => {
    guardarConvitePendente({ codigo: "7KQMX4PD", expira_em: "2026-11-25T11:59:00Z" });
    expect(lerConvitePendente(AGORA)).toBeNull();
    expect(localStorage.getItem("clgym.convite")).toBeNull();
  });

  it("ignora e apaga o que estiver estragado", () => {
    localStorage.setItem("clgym.convite", "{não é json");
    expect(lerConvitePendente(AGORA)).toBeNull();
    localStorage.setItem("clgym.convite", JSON.stringify({ codigo: "", expira_em: "2026-11-26T12:00:00Z" }));
    expect(lerConvitePendente(AGORA)).toBeNull();
    expect(localStorage.getItem("clgym.convite")).toBeNull();
  });
});
