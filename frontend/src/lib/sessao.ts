import { useEffect, useState } from "react";

import { api, ErroApi, gravarToken } from "./api";
import { apagarConvitePendente, lerConvitePendente } from "./convitePendente";
import { apagarTudo, db, gravarMeta, lerMeta } from "./db";
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

/** O que as telas de entrada precisam do servidor (botão do Google e login de dev). */
export function useConfigLogin(): { config: ConfigLogin | null; erro: string | null } {
  const [config, setConfig] = useState<ConfigLogin | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    configLogin()
      .then(setConfig)
      .catch((e: unknown) => setErro(e instanceof ErroApi ? e.message : "Não deu para entrar. Tente de novo."));
  }, []);
  return { config, erro };
}

/** Um recado depois de tentar entrar: "info" quando só falta o convite, "erro" no resto. */
export interface Recado {
  tipo: "info" | "erro";
  texto: string;
}

export function recadoDoErro(erro: unknown): Recado {
  if (!(erro instanceof ErroApi)) return { tipo: "erro", texto: "Não deu para entrar. Tente de novo." };
  return { tipo: erro.motivo === "sem-convite" ? "info" : "erro", texto: erro.message };
}

async function concluirLogin(resposta: RespostaLogin): Promise<void> {
  const anterior = await lerMeta<Usuario>("usuario");
  // Outra pessoa entrando neste aparelho: não mistura os dados.
  if (anterior && anterior.id !== resposta.usuario.id) await apagarTudo();
  gravarToken(resposta.token);
  apagarConvitePendente();
  await gravarMeta("usuario", resposta.usuario);
  // Entrou: some o aviso de por que tinha saído (e a marca antiga, de antes do motivo).
  await db.meta.bulkDelete(["saida", "sessao_expirada"]);
  // O iPhone pode apagar dados de sites pouco usados; isto pede para guardar de vez.
  void navigator.storage?.persist?.();
  await sincronizar();
}

/**
 * Faz o login e manda junto o convite conferido, se houver (só serve para criar a conta; quem já
 * tem conta entra sem ele). Um convite recusado pelo servidor é esquecido.
 */
async function entrar(caminho: "/auth/google" | "/auth/dev", corpo: Record<string, unknown>): Promise<void> {
  const convite = lerConvitePendente();
  let resposta: RespostaLogin;
  try {
    resposta = await api<RespostaLogin>(caminho, {
      metodo: "POST",
      corpo: convite ? { ...corpo, convite: convite.codigo } : corpo,
    });
  } catch (erro) {
    if (erro instanceof ErroApi && erro.motivo === "convite-invalido") apagarConvitePendente();
    throw erro;
  }
  await concluirLogin(resposta);
}

export function entrarComGoogle(idToken: string): Promise<void> {
  return entrar("/auth/google", { id_token: idToken });
}

export function entrarDev(email: string): Promise<void> {
  return entrar("/auth/dev", { email });
}

export async function sair(): Promise<void> {
  gravarToken(null);
  await apagarTudo();
}
