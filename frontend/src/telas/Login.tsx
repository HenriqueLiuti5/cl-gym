import { useEffect, useRef, useState } from "react";

import { Aviso, Botao, Campo, Cartao, estiloEntrada } from "../componentes/ui";
import { ErroApi } from "../lib/api";
import { configLogin, entrarComGoogle, entrarDev, type ConfigLogin } from "../lib/sessao";

interface GoogleId {
  initialize(opcoes: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(elemento: HTMLElement, opcoes: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

function carregarGoogle(): Promise<GoogleId> {
  return new Promise((resolver, rejeitar) => {
    if (window.google) return resolver(window.google.accounts.id);
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () =>
      window.google ? resolver(window.google.accounts.id) : rejeitar(new Error("sem Google"));
    script.onerror = () => rejeitar(new Error("sem Google"));
    document.head.appendChild(script);
  });
}

function mensagem(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.message;
  return "Não deu para entrar. Tente de novo.";
}

export function Login({ expirou }: { expirou: boolean }) {
  const [config, setConfig] = useState<ConfigLogin | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [emailDev, setEmailDev] = useState("");
  const botaoGoogle = useRef<HTMLDivElement>(null);

  useEffect(() => {
    configLogin()
      .then(setConfig)
      .catch((e: unknown) => setErro(mensagem(e)));
  }, []);

  useEffect(() => {
    if (!config || !botaoGoogle.current) return;
    const alvo = botaoGoogle.current;
    carregarGoogle()
      .then((google) => {
        google.initialize({
          client_id: config.google_client_id,
          callback: ({ credential }) => {
            setCarregando(true);
            setErro(null);
            entrarComGoogle(credential)
              .catch((e: unknown) => setErro(mensagem(e)))
              .finally(() => setCarregando(false));
          },
        });
        google.renderButton(alvo, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "continue_with",
          locale: "pt-BR",
          width: 280,
        });
      })
      .catch(() => setErro("Não deu para carregar o login do Google. Confira a internet."));
  }, [config]);

  async function entrarComoDev() {
    setCarregando(true);
    setErro(null);
    try {
      await entrarDev(emailDev);
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="text-center">
        <img src="/icone.svg" alt="" className="mx-auto mb-4 h-20 w-20" />
        <h1 className="text-3xl font-bold">CL Gym</h1>
        <p className="mt-2 text-slate-400">Seus treinos e cargas, mesmo sem internet.</p>
      </div>

      {expirou && <Aviso tipo="info">Sua sessão acabou. Entre de novo; nada do que está no celular se perdeu.</Aviso>}
      {erro && <Aviso tipo="ruim">{erro}</Aviso>}

      <Cartao className="flex flex-col items-center gap-3">
        <p className="text-center text-sm text-slate-400">Só entra quem foi convidado.</p>
        <div ref={botaoGoogle} className="min-h-11" />
        {carregando && <p className="text-sm text-slate-400">Entrando…</p>}
      </Cartao>

      {config?.login_dev && (
        <Cartao className="space-y-3 border border-dashed border-amber-700">
          <p className="text-sm text-amber-300">Login de desenvolvimento (só no computador, nunca em produção).</p>
          <Campo rotulo="E-mail convidado">
            <input
              className={estiloEntrada}
              type="email"
              value={emailDev}
              onChange={(e) => setEmailDev(e.target.value)}
              placeholder="voce@gmail.com"
            />
          </Campo>
          <Botao variante="principal" className="w-full" disabled={!emailDev || carregando} onClick={entrarComoDev}>
            Entrar como dev
          </Botao>
        </Cartao>
      )}

      <a href="#/instalar" className="text-center text-sm text-emerald-400 underline">
        Como instalar o app no celular
      </a>
    </main>
  );
}
