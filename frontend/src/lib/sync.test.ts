import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TABELAS } from "./tipos";

// O servidor e o banco local são trocados por versões simples: aqui só importa quando e quantas
// vezes a sincronização chama o servidor.
const { api, meta } = vi.hoisted(() => ({ api: vi.fn(), meta: new Map<string, unknown>() }));

vi.mock("./api", () => ({
  api,
  lerToken: () => "token",
  gravarToken: vi.fn(),
  ErroApi: class extends Error {
    constructor(
      public status: number,
      mensagem: string,
    ) {
      super(mensagem);
    }
  },
}));

vi.mock("./db", () => {
  const vazia = {
    where: () => ({ equals: () => ({ toArray: async () => [] }) }),
    get: async () => undefined,
    put: async () => undefined,
  };
  return {
    agora: () => new Date().toISOString(),
    db: { transaction: async (...args: unknown[]) => (args.at(-1) as () => Promise<void>)() },
    tabela: () => vazia,
    lerMeta: async (chave: string) => meta.get(chave),
    gravarMeta: async (chave: string, valor: unknown) => void meta.set(chave, valor),
  };
});

import { ESPERA_MS, sincronizar, sincronizarEmBreve, type EstadoSync } from "./sync";

const pacoteVazio = () => ({ cursor: 1, ...Object.fromEntries(TABELAS.map((t) => [t, []])) });
const estado = () => meta.get("estado_sync") as EstadoSync | undefined;

beforeEach(() => {
  meta.clear();
  api.mockReset();
  api.mockImplementation(async () => pacoteVazio());
  vi.stubGlobal("navigator", { onLine: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sincronizar", () => {
  it("sem internet nem tenta, e guarda quando foi a última vez que deu certo", async () => {
    await sincronizar();
    const quando = estado()?.quando;
    expect(estado()?.situacao).toBe("ok");
    expect(quando).toBeTruthy();

    api.mockClear();
    vi.stubGlobal("navigator", { onLine: false });
    await sincronizar();
    expect(api).not.toHaveBeenCalled();
    expect(estado()).toEqual({ situacao: "offline", quando });
  });

  it("chamada no meio de outra, roda de novo no fim", async () => {
    let liberar = () => {};
    api.mockImplementationOnce(
      () => new Promise((resolve) => (liberar = () => resolve(pacoteVazio()))),
    );
    const primeira = sincronizar();
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const segunda = sincronizar(); // ex.: salvou algo enquanto baixava
    liberar();
    await Promise.all([primeira, segunda]);
    expect(api).toHaveBeenCalledTimes(2);
  });
});

describe("sincronizarEmBreve", () => {
  it("junta mudanças seguidas numa sincronização só", async () => {
    vi.useFakeTimers();
    sincronizarEmBreve();
    await vi.advanceTimersByTimeAsync(ESPERA_MS / 2);
    sincronizarEmBreve();
    sincronizarEmBreve();
    await vi.advanceTimersByTimeAsync(ESPERA_MS - 1);
    expect(api).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  });
});
