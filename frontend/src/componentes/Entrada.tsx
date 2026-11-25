// Peças das telas de entrada (login e convite): a moldura com a logo, o botão do Google, o campo
// do código do convite e o login de desenvolvimento.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { api, ErroApi } from "../lib/api";
import { codigoCompleto, formatarCodigo, mensagemSituacao, normalizarCodigo, type SituacaoConvite } from "../lib/convite";
import { guardarConvitePendente, type ConvitePendente } from "../lib/convitePendente";
import type { Saida } from "../lib/tipos";
import { Aviso, Botao, Campo, estiloEntrada } from "./ui";

/** Resposta de `GET /api/convites/{id}` e de `POST /api/convites/verificar`. */
export interface RespostaConvite {
  situacao: SituacaoConvite;
  expira_em: string;
}

/** Topo preto com a logo e a folha arredondada embaixo, com o título e a frase. */
export function MolduraEntrada({ titulo, frase, children }: { titulo: string; frase: string; children: ReactNode }) {
  // A barra do navegador acompanha o topo preto da logo enquanto a tela está aberta.
  useEffect(() => {
    const antes = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
      (meta) => [meta, meta.content] as const,
    );
    for (const [meta] of antes) meta.content = "#000000";
    return () => {
      for (const [meta, cor] of antes) meta.content = cor;
    };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col bg-black">
      <div className="flex flex-1 items-center justify-center px-6 pt-[max(env(safe-area-inset-top),2.5rem)] pb-14">
        <img src="/logo-1024.png" alt="" className="aspect-square w-[min(76vw,40dvh,320px)]" />
      </div>

      <div className="-mt-7 rounded-t-[28px] bg-fundo px-6 pt-8 pb-[max(env(safe-area-inset-bottom),2rem)]">
        <div className="mx-auto max-w-sm">
          <h1 className="text-center text-[30px] leading-tight font-bold">{titulo}</h1>
          <p className="mx-auto mt-1.5 max-w-xs text-center text-[17px] leading-snug text-texto-2">{frase}</p>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </main>
  );
}

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

/**
 * Botão "Continuar com o Google". Enquanto o `clientId` não chega (ou o script do Google carrega),
 * mostra o lugar do botão, para a tela não pular.
 */
export function BotaoGoogle({
  clientId,
  aoEntrar,
  aoFalhar,
}: {
  clientId: string | null;
  aoEntrar: (credencial: string) => void;
  aoFalhar: (mensagem: string) => void;
}) {
  const alvoRef = useRef<HTMLDivElement>(null);
  const [pronto, setPronto] = useState(false);
  const [falhou, setFalhou] = useState(false);
  // O Google chama de volta bem depois de desenhar o botão: sempre com as funções mais novas.
  const retorno = useRef({ aoEntrar, aoFalhar });
  useEffect(() => {
    retorno.current = { aoEntrar, aoFalhar };
  });

  useEffect(() => {
    if (!clientId || !alvoRef.current) return;
    const alvo = alvoRef.current;
    const temaEscuro = window.matchMedia("(prefers-color-scheme: dark)");
    let ativo = true;
    let desenhar: (() => void) | null = null;
    carregarGoogle()
      .then((google) => {
        if (!ativo) return;
        google.initialize({
          client_id: clientId,
          callback: ({ credential }) => retorno.current.aoEntrar(credential),
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
        setPronto(true);
      })
      .catch(() => {
        if (!ativo) return;
        setFalhou(true);
        retorno.current.aoFalhar("Não deu para carregar o login do Google. Confira a internet.");
      });
    return () => {
      ativo = false;
      if (desenhar) temaEscuro.removeEventListener("change", desenhar);
    };
  }, [clientId]);

  return (
    <div className="relative min-h-10">
      {!pronto && !falhou && <div className="absolute inset-x-0 top-0 h-10 rounded-full bg-linha" />}
      {/* Esquema claro no lugar do iframe: com o do app (escuro), o Chrome pinta um fundo branco
          atrás da pílula do Google. */}
      <div ref={alvoRef} className="relative flex w-full justify-center [color-scheme:light]" />
    </div>
  );
}

const estiloCodigo =
  "h-14 w-full rounded-xl border border-borda bg-superficie px-4 text-center text-[22px] font-semibold tracking-[0.16em] text-texto outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-texto-3 focus:border-acento";

/**
 * Campo do código do convite (8 letras e números, mostrado como 7KQM-X4PD). Confere no servidor
 * sem gastar o convite; se valer, guarda como pendente para o login e avisa quem chamou.
 */
export function CampoCodigo({
  rotulo,
  variante = "principal",
  aoConfirmar,
  aoCancelar,
}: {
  rotulo: string;
  variante?: "principal" | "secundario";
  aoConfirmar: (convite: ConvitePendente) => void;
  aoCancelar?: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);

  async function conferir(evento: FormEvent) {
    evento.preventDefault();
    if (!codigoCompleto(codigo)) {
      setErro("O código tem 8 letras e números, como 7KQM-X4PD.");
      return;
    }
    setConferindo(true);
    setErro(null);
    try {
      const resposta = await api<RespostaConvite>("/convites/verificar", { metodo: "POST", corpo: { codigo } });
      if (resposta.situacao !== "valido") {
        setErro(mensagemSituacao(resposta.situacao));
        return;
      }
      const convite = { codigo, expira_em: resposta.expira_em };
      guardarConvitePendente(convite);
      aoConfirmar(convite);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 404) setErro("Código não encontrado. Confira as letras e os números.");
      else if (e instanceof ErroApi && e.status === 0) setErro("Sem internet agora. Conecte-se para conferir o código.");
      else setErro(e instanceof ErroApi ? e.message : "Não deu para conferir o código. Tente de novo.");
    } finally {
      setConferindo(false);
    }
  }

  const botao = (
    <Botao type="submit" variante={variante} className="w-full" disabled={conferindo || !codigo}>
      {conferindo ? "Conferindo…" : rotulo}
    </Botao>
  );

  return (
    <form className="space-y-3" onSubmit={conferir} noValidate>
      <Campo rotulo="Código do convite" dica="Veio junto com o link do convite.">
        <input
          className={estiloCodigo}
          value={formatarCodigo(codigo)}
          onChange={(e) => {
            setCodigo(normalizarCodigo(e.target.value));
            setErro(null);
          }}
          placeholder="XXXX-XXXX"
          inputMode="text"
          enterKeyHint="go"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </Campo>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aoCancelar ? (
        <div className="grid grid-cols-2 gap-2">
          <Botao variante="fantasma" onClick={aoCancelar}>
            Cancelar
          </Botao>
          {botao}
        </div>
      ) : (
        botao
      )}
    </form>
  );
}

const CHAVE_EMAIL_DEV = "clgym.email_dev";

/** Login sem Google, só no computador (o servidor recusa em produção). Lembra o último e-mail. */
export function FormularioDev({ ocupado, aoEntrar }: { ocupado: boolean; aoEntrar: (email: string) => void }) {
  const [email, setEmail] = useState(() => localStorage.getItem(CHAVE_EMAIL_DEV) ?? "");

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    localStorage.setItem(CHAVE_EMAIL_DEV, email.trim());
    aoEntrar(email.trim());
  }

  return (
    <form className="mt-8 border-t border-linha pt-5" onSubmit={enviar}>
      <h2 className="text-[13px] font-semibold text-texto-2">Login de desenvolvimento</h2>
      <p className="mt-0.5 text-[13px] text-texto-3">Só neste computador; em produção não existe.</p>
      <div className="mt-3 flex gap-2">
        <input
          className={`${estiloEntrada} min-w-0 flex-1`}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          aria-label="E-mail"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Botao type="submit" className="shrink-0" disabled={!email.trim() || ocupado}>
          Entrar
        </Botao>
      </div>
    </form>
  );
}

/** Por que o app saiu da conta sozinho. */
export function AvisoSaida({ saida }: { saida?: Saida }) {
  if (!saida) return null;
  if (saida.motivo === "bloqueado") {
    return (
      <Aviso tipo="erro" icone="cadeado">
        {saida.mensagem || "Seu acesso ao CL Gym foi bloqueado."}
      </Aviso>
    );
  }
  if (saida.motivo === "conta-apagada") {
    return (
      <Aviso tipo="info">
        {saida.mensagem || "Esta conta foi apagada."} Para voltar, você precisa de um convite novo.
      </Aviso>
    );
  }
  return <Aviso tipo="info">Sua sessão acabou. Entre de novo; nada do que está no celular se perdeu.</Aviso>;
}
