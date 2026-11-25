// "Instalar o app": abre o pedido de instalação do navegador (Chrome, Edge) ou, sem ele, uma janela
// com os passos (iPhone e iPad: Compartilhar → Adicionar à Tela de Início; Android: menu do
// Chrome). Não aparece dentro do app instalado. A lógica fica em lib/instalar.ts.

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { deveMostrarInstalar, ehSafari, pedirInstalacao, plataformaAtual, useInstalacao, type Plataforma } from "../lib/instalar";
import { Icone, type NomeIcone } from "./icones";
import { Aviso, Botao, Linha, Modal } from "./ui";

function useInstalar() {
  const estado = useInstalacao();
  const [plataforma] = useState(plataformaAtual);
  const [passos, setPassos] = useState(false);
  return {
    mostrar: deveMostrarInstalar(estado, plataforma),
    plataforma,
    passos,
    fecharPassos: () => setPassos(false),
    abrir: () => {
      if (estado.podePedir) void pedirInstalacao();
      else setPassos(true);
    },
  };
}

/** Ícone desenhado dentro do texto, como aparece no navegador. */
function IconeNoTexto({ nome }: { nome: NomeIcone }) {
  return (
    <span className="mx-0.5 inline-grid h-7 w-7 place-items-center rounded-md bg-campo align-middle text-acento">
      <Icone nome={nome} className="h-5 w-5" />
    </span>
  );
}

function Passo({ numero, children }: { numero: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-acento-suave text-[15px] font-semibold text-acento">
        {numero}
      </span>
      <p className="min-w-0 pt-0.5 text-[16px] leading-[1.9rem]">{children}</p>
    </li>
  );
}

/**
 * A janela com os passos. Vai direto para o <body> (portal): dentro de uma lista agrupada, o
 * `position: relative` das linhas tiraria a janela do lugar.
 */
function Passos({ plataforma, fechar }: { plataforma: Plataforma; fechar: () => void }) {
  const naBarra = ehSafari(navigator.userAgent) ? "na barra do Safari" : "na barra do navegador";
  return createPortal(
    <Modal titulo="Instalar o CL Gym" posicao="baixo" fechar={fechar}>
      <p className="text-[15px] leading-snug text-texto-2">
        Instalado, o app fica na tela de início, abre em tela cheia e funciona sem internet.
      </p>
      {plataforma === "ios" ? (
        <>
          <ol className="space-y-3">
            <Passo numero={1}>
              Toque em <strong className="font-semibold">Compartilhar</strong> <IconeNoTexto nome="compartilhar" /> {naBarra}.
            </Passo>
            <Passo numero={2}>
              Role e toque em <strong className="font-semibold">Adicionar à Tela de Início</strong> <IconeNoTexto nome="adicionarTela" />.
            </Passo>
            <Passo numero={3}>
              Toque em <strong className="font-semibold">Adicionar</strong>, no canto de cima.
            </Passo>
          </ol>
          <Aviso tipo="info">
            Se o link abriu dentro do WhatsApp ou do Instagram, abra no Safari antes. No app instalado, entre de novo com o
            Google (quem ainda não tem conta usa &ldquo;Tenho um convite&rdquo;).
          </Aviso>
        </>
      ) : (
        <>
          <ol className="space-y-3">
            <Passo numero={1}>
              Toque no menu <IconeNoTexto nome="menuPontos" /> do Chrome, no canto de cima.
            </Passo>
            <Passo numero={2}>
              Toque em <strong className="font-semibold">Instalar app</strong> (ou{" "}
              <strong className="font-semibold">Adicionar à tela inicial</strong>).
            </Passo>
            <Passo numero={3}>
              Confirme em <strong className="font-semibold">Instalar</strong>.
            </Passo>
          </ol>
          <Aviso tipo="info">Se o link abriu dentro do WhatsApp ou do Instagram, abra no Chrome antes.</Aviso>
        </>
      )}
      <Botao variante="principal" className="w-full" onClick={fechar}>
        Entendi
      </Botao>
    </Modal>,
    document.body,
  );
}

const FRASE = "Fica na tela de início e funciona sem internet.";

/** Para as telas de login e convite (antes de entrar): um cartão com o ícone do app. */
export function BotaoInstalar() {
  const { mostrar, abrir, passos, fecharPassos, plataforma } = useInstalar();
  return (
    <>
      {mostrar && (
        <button
          type="button"
          onClick={abrir}
          className="flex w-full items-center gap-3 rounded-xl bg-superficie px-4 py-3 text-left active:bg-campo"
        >
          <img src="/icone-192.png" alt="" className="h-11 w-11 shrink-0 rounded-[11px]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold">Instalar o app</span>
            <span className="mt-0.5 block text-[14px] leading-snug text-texto-2">{FRASE}</span>
          </span>
          <Icone nome="avancar" className="-mr-1 h-5 w-5 text-texto-3" />
        </button>
      )}
      {passos && <Passos plataforma={plataforma} fechar={fecharPassos} />}
    </>
  );
}

/**
 * Linha "Instalar o app" para uma lista agrupada (`Grupo`) da aba Conta, quando o app está aberto
 * no navegador. Não mostra nada no app instalado.
 */
export function LinhaInstalar() {
  const { mostrar, abrir, passos, fecharPassos, plataforma } = useInstalar();
  return (
    <>
      {mostrar && <Linha titulo="Instalar o app" subtitulo={FRASE} tom="acento" onClick={abrir} />}
      {passos && <Passos plataforma={plataforma} fechar={fecharPassos} />}
    </>
  );
}
