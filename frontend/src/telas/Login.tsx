import { useEffect, useRef, useState } from "react";

import { Aviso, Botao, Campo, estiloEntrada } from "../componentes/ui";
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
        const escuro = window.matchMedia("(prefers-color-scheme: dark)").matches;
        google.renderButton(alvo, {
          theme: escuro ? "filled_black" : "outline",
          size: "large",
          shape: "rectangular",
          text: "continue_with",
          locale: "pt-BR",
          // O botão do Google aceita de 200 a 400 px: ocupa a largura da coluna.
          width: Math.min(400, Math.max(200, alvo.offsetWidth)),
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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-10">
        <img src="/icone.svg" alt="" className="mb-5 h-16 w-16 rounded-[18px]" />
        <h1 className="text-[32px] leading-tight font-bold">CL Gym</h1>
        <p className="mt-2 text-[17px] leading-snug text-texto-2">Treinos, cargas, peso e alimentação. Funciona mesmo sem internet.</p>
      </div>

      <div className="space-y-3">
        {expirou && <Aviso tipo="info">Sua sessão acabou. Entre de novo; nada do que está no celular se perdeu.</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div ref={botaoGoogle} className="min-h-11 w-full" />
        <p className="text-[13px] text-texto-3">{carregando ? "Entrando…" : "Só entra quem foi convidado."}</p>
      </div>

      {config?.login_dev && (
        <section className="mt-10 space-y-3 rounded-xl border border-dashed border-borda p-4">
          <p className="text-[13px] text-texto-2">
            <strong className="font-semibold text-texto">Login de desenvolvimento.</strong> Só no computador, nunca em produção.
          </p>
          <Campo rotulo="E-mail convidado">
            <input
              className={estiloEntrada}
              type="email"
              value={emailDev}
              onChange={(e) => setEmailDev(e.target.value)}
              placeholder="voce@gmail.com"
            />
          </Campo>
          <Botao className="w-full" disabled={!emailDev || carregando} onClick={entrarComoDev}>
            Entrar como dev
          </Botao>
        </section>
      )}
    </main>
  );
}
