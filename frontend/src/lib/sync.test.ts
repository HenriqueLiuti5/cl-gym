import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TABELAS } from "./tipos";

// O servidor e o banco local são trocados por versões simples: aqui só importa quando e quantas
// vezes a sincronização chama o servidor.
const { api, meta, gravarToken, ErroApi } = vi.hoisted(() => ({
  api: vi.fn(),
  meta: new Map<string, unknown>(),
  gravarToken: vi.fn(),
  ErroApi: class extends Error {
    constructor(
      public status: number,
      mensagem: string,
      public motivo: string | null = null,
    ) {
      super(mensagem);
    }
  },
}));

vi.mock("./api", () => ({ api, lerToken: () => "token", gravarToken, ErroApi }));

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
import type { Saida } from "./tipos";

const pacoteVazio = () => ({ cursor: 1, ...Object.fromEntries(TABELAS.map((t) => [t, []])) });
const estado = () => meta.get("estado_sync") as EstadoSync | undefined;

beforeEach(() => {
  meta.clear();
  gravarToken.mockClear();
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

describe("sair da conta pelo servidor", () => {
  const falhar = (erro: InstanceType<typeof ErroApi>) => api.mockImplementation(async () => Promise.reject(erro));

  it("sessão vencida: sai e a tela de login explica", async () => {
    falhar(new ErroApi(401, "Token de sessão inválido ou vencido"));
    await sincronizar();
    expect(gravarToken).toHaveBeenCalledWith(null);
    expect(meta.get("saida")).toEqual({ motivo: "sessao-expirada" } satisfies Saida);
  });

  it("conta apagada: sai com a frase do servidor", async () => {
    falhar(new ErroApi(401, "Esta conta foi apagada.", "conta-apagada"));
    await sincronizar();
    expect(gravarToken).toHaveBeenCalledWith(null);
    expect(meta.get("saida")).toEqual({ motivo: "conta-apagada", mensagem: "Esta conta foi apagada." });
  });

  it("acesso bloqueado: sai com a frase do servidor", async () => {
    falhar(new ErroApi(403, "Seu acesso ao CL Gym foi bloqueado.", "bloqueado"));
    await sincronizar();
    expect(gravarToken).toHaveBeenCalledWith(null);
    expect(meta.get("saida")).toEqual({ motivo: "bloqueado", mensagem: "Seu acesso ao CL Gym foi bloqueado." });
  });

  it("outro 403 não tira ninguém da conta: só mostra o erro", async () => {
    falhar(new ErroApi(403, "Registro de outra pessoa"));
    await sincronizar();
    expect(gravarToken).not.toHaveBeenCalled();
    expect(meta.has("saida")).toBe(false);
    expect(estado()?.situacao).toBe("erro");
  });

  it("sem internet ou servidor fora do ar, fica tudo como está", async () => {
    falhar(new ErroApi(0, "Sem internet agora."));
    await sincronizar();
    expect(gravarToken).not.toHaveBeenCalled();
    expect(estado()?.situacao).toBe("offline");
  });
});
