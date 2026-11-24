// Chamadas à API (mesmo endereço do app: /api). O token de sessão fica no aparelho.

const CHAVE_TOKEN = "cl-gym:token";

export class ErroApi extends Error {
  /** 0 = sem conexão ou servidor fora do ar. */
  readonly status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

export function lerToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export function gravarToken(token: string | null): void {
  if (token) localStorage.setItem(CHAVE_TOKEN, token);
  else localStorage.removeItem(CHAVE_TOKEN);
}

interface Opcoes {
  metodo?: "GET" | "POST" | "PATCH" | "DELETE";
  corpo?: unknown;
}

export async function api<T>(caminho: string, { metodo = "GET", corpo }: Opcoes = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = lerToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) headers["Content-Type"] = "application/json";

  let resposta: Response;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi(0, "Sem internet agora. Tudo fica salvo no celular.");
  }

  if (resposta.status >= 500) {
    // Servidor fora do ar (ou partida a frio que falhou): para o app é como estar sem internet.
    throw new ErroApi(0, "O servidor não respondeu agora. Tudo fica salvo no celular.");
  }
  if (!resposta.ok) {
    let detalhe = `Erro ${resposta.status}`;
    try {
      const dados = (await resposta.json()) as { detail?: unknown };
      if (typeof dados.detail === "string") detalhe = dados.detail;
      else if (resposta.status === 422) detalhe = "Algum dado não passou na conferência do servidor.";
    } catch {
      // resposta sem JSON
    }
    throw new ErroApi(resposta.status, detalhe);
  }
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}
