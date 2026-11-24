import { api, gravarToken } from "./api";
import { apagarTudo, gravarMeta, lerMeta } from "./db";
import { sincronizar } from "./sync";
import type { Usuario } from "./tipos";

interface RespostaLogin {
  token: string;
  expira_em: string;
  usuario: Usuario;
  novo: boolean;
}

export interface ConfigLogin {
  google_client_id: string;
  login_dev: boolean;
}

export function configLogin(): Promise<ConfigLogin> {
  return api<ConfigLogin>("/auth/config");
}

async function concluirLogin(resposta: RespostaLogin): Promise<void> {
  const anterior = await lerMeta<Usuario>("usuario");
  // Outra pessoa entrando neste aparelho: não mistura os dados.
  if (anterior && anterior.id !== resposta.usuario.id) await apagarTudo();
  gravarToken(resposta.token);
  await gravarMeta("usuario", resposta.usuario);
  await gravarMeta("sessao_expirada", false);
  // O iPhone pode apagar dados de sites pouco usados; isto pede para guardar de vez.
  void navigator.storage?.persist?.();
  await sincronizar();
}

export async function entrarComGoogle(idToken: string): Promise<void> {
  await concluirLogin(
    await api<RespostaLogin>("/auth/google", { metodo: "POST", corpo: { id_token: idToken } }),
  );
}

export async function entrarDev(email: string): Promise<void> {
  await concluirLogin(
    await api<RespostaLogin>("/auth/dev", { metodo: "POST", corpo: { email } }),
  );
}

export async function sair(): Promise<void> {
  gravarToken(null);
  await apagarTudo();
}
