import { useEffect, useRef, useState, type FormEvent } from "react";

import { Aviso, Botao, estiloEntrada } from "../componentes/ui";
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

const CHAVE_EMAIL_DEV = "clgym.email_dev";

export function Login({ expirou }: { expirou: boolean }) {
  const [config, setConfig] = useState<ConfigLogin | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [googlePronto, setGooglePronto] = useState(false);
  const [emailDev, setEmailDev] = useState(() => localStorage.getItem(CHAVE_EMAIL_DEV) ?? "");
  const botaoGoogle = useRef<HTMLDivElement>(null);

  useEffect(() => {
    configLogin()
      .then(setConfig)
      .catch((e: unknown) => setErro(mensagem(e)));
  }, []);

  // A barra do navegador acompanha o topo preto da logo enquanto esta tela está aberta.
  useEffect(() => {
    const antes = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
      (meta) => [meta, meta.content] as const,
    );
    for (const [meta] of antes) meta.content = "#000000";
    return () => {
      for (const [meta, cor] of antes) meta.content = cor;
    };
  }, []);

  useEffect(() => {
    if (!config || !botaoGoogle.current) return;
    const alvo = botaoGoogle.current;
    const temaEscuro = window.matchMedia("(prefers-color-scheme: dark)");
    let ativo = true;
    let desenhar: (() => void) | null = null;
    carregarGoogle()
      .then((google) => {
        if (!ativo) return;
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
        // O botão é do Google (num iframe): só dá para escolher entre as opções dele. Pílula com o
        // "G" no centro; preto no tema claro (combina com o topo da logo) e branco no escuro, onde o
        // preto sumiria no fundo.
        desenhar = () => {
          alvo.replaceChildren();
          google.renderButton(alvo, {
            theme: temaEscuro.matches ? "outline" : "filled_black",
            size: "large",
            shape: "pill",
            logo_alignment: "center",
            text: "continue_with",
            locale: "pt-BR",
            // O botão do Google aceita de 200 a 400 px: ocupa a largura da coluna.
            width: Math.min(400, Math.max(200, alvo.offsetWidth)),
          });
        };
        desenhar();
        temaEscuro.addEventListener("change", desenhar);
        setGooglePronto(true);
      })
      .catch(() => setErro("Não deu para carregar o login do Google. Confira a internet."));
    return () => {
      ativo = false;
      if (desenhar) temaEscuro.removeEventListener("change", desenhar);
    };
  }, [config]);

  async function entrarComoDev(evento: FormEvent) {
    evento.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      await entrarDev(emailDev);
      localStorage.setItem(CHAVE_EMAIL_DEV, emailDev);
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-black">
      <div className="flex flex-1 items-center justify-center px-6 pt-[max(env(safe-area-inset-top),2.5rem)] pb-14">
        <img src="/logo-1024.png" alt="" className="aspect-square w-[min(76vw,40dvh,320px)]" />
      </div>

      <div className="-mt-7 rounded-t-[28px] bg-fundo px-6 pt-8 pb-[max(env(safe-area-inset-bottom),2rem)]">
        <div className="mx-auto max-w-sm">
          <h1 className="text-center text-[30px] leading-tight font-bold">CL Gym</h1>
          <p className="mx-auto mt-1.5 max-w-xs text-center text-[17px] leading-snug text-texto-2">
            Treinos, cargas, peso e alimentação. Funciona mesmo sem internet.
          </p>

          <div className="mt-7 space-y-3">
            {expirou && <Aviso tipo="info">Sua sessão acabou. Entre de novo; nada do que está no celular se perdeu.</Aviso>}
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <div className="relative min-h-10">
              {/* Lugar do botão enquanto o script do Google carrega, para a tela não pular. */}
              {!googlePronto && !erro && <div className="absolute inset-x-0 top-0 h-10 rounded-full bg-campo" />}
              {/* Esquema claro no lugar do iframe: com o do app (escuro), o Chrome pinta um fundo
                  branco atrás da pílula do Google. */}
              <div ref={botaoGoogle} className="relative flex w-full justify-center [color-scheme:light]" />
            </div>
            <p className="text-center text-[13px] text-texto-3" aria-live="polite">
              {carregando ? "Entrando…" : "Só entra quem foi convidado."}
            </p>
          </div>

          {config?.login_dev && (
            <form className="mt-8 border-t border-linha pt-5" onSubmit={entrarComoDev}>
              <h2 className="text-[13px] font-semibold text-texto-2">Login de desenvolvimento</h2>
              <p className="mt-0.5 text-[13px] text-texto-3">Só neste computador; em produção não existe.</p>
              <div className="mt-3 flex gap-2">
                <input
                  className={`${estiloEntrada} min-w-0 flex-1`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  aria-label="E-mail convidado"
                  placeholder="E-mail convidado"
                  value={emailDev}
                  onChange={(e) => setEmailDev(e.target.value)}
                />
                <Botao type="submit" className="shrink-0" disabled={!emailDev || carregando}>
                  Entrar
                </Botao>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
