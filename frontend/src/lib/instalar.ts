// Instalar o app (PWA).
// - Android e computador (Chrome, Edge): o navegador avisa que dá para instalar com o evento
//   `beforeinstallprompt`. O evento fica guardado e o botão "Instalar o app" abre o pedido nativo.
// - iPhone e iPad: esse evento não existe. O botão mostra os passos (Compartilhar → "Adicionar à
//   Tela de Início"); no Android sem o evento, os passos do menu do Chrome.
// O evento pode chegar antes de a tela de login aparecer, por isso este módulo escuta desde o
// carregamento do app (é importado no main.tsx).

import { useSyncExternalStore } from "react";

export type Plataforma = "ios" | "android" | "outro";

/** O evento `beforeinstallprompt` (ainda sem tipo no TypeScript). */
interface PedidoInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface EstadoInstalacao {
  /** O navegador deixou abrir o pedido de instalação dele (Chrome, Edge). */
  podePedir: boolean;
  /** Aberto pelo ícone da tela de início (já é o app instalado). */
  aberturaInstalada: boolean;
  /** Instalou por este navegador (evento `appinstalled`), mesmo que a aba continue aberta. */
  jaInstalou: boolean;
}

// Guardado por navegador: depois de instalar, a aba antiga não oferece instalar de novo.
const CHAVE_INSTALOU = "clgym.instalou";

/** Aberto pelo ícone da tela de início (app instalado), e não pelo navegador. */
export function estaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  const iphone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iphone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/** iPhone e iPad (o iPad novo se apresenta como Mac, e só o toque o denuncia), Android ou outro. */
export function detectarPlataforma(userAgent: string, toquesMaximos = 0): Plataforma {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (/Macintosh/.test(userAgent) && toquesMaximos > 1) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "outro";
}

/** No iPhone, o botão de compartilhar fica na barra do Safari; nos outros navegadores, na deles. */
export function ehSafari(userAgent: string): boolean {
  return /Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent);
}

/**
 * Mostrar o botão "Instalar o app"? Nunca no app instalado. Com o pedido nativo, sempre. Sem ele,
 * só no celular (com os passos) e se ainda não instalou por este navegador; no computador sem o
 * pedido nativo não há o que fazer.
 */
export function deveMostrarInstalar(estado: EstadoInstalacao, plataforma: Plataforma): boolean {
  if (estado.aberturaInstalada) return false;
  if (estado.podePedir) return true;
  if (estado.jaInstalou) return false;
  return plataforma !== "outro";
}

export function plataformaAtual(): Plataforma {
  if (typeof navigator === "undefined") return "outro";
  return detectarPlataforma(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

function lerInstalou(): boolean {
  try {
    return localStorage.getItem(CHAVE_INSTALOU) === "1";
  } catch {
    return false;
  }
}

function marcarInstalou(): void {
  try {
    localStorage.setItem(CHAVE_INSTALOU, "1");
  } catch {
    // sem armazenamento (navegação privada): só não lembra
  }
}

let pedido: PedidoInstalacao | null = null;
let estado: EstadoInstalacao = { podePedir: false, aberturaInstalada: false, jaInstalou: false };
const ouvintes = new Set<() => void>();

function atualizar(): void {
  // Um objeto novo a cada mudança: é assim que o useSyncExternalStore percebe que mudou.
  estado = { podePedir: pedido !== null, aberturaInstalada: estaInstalado(), jaInstalou: lerInstalou() };
  for (const ouvinte of ouvintes) ouvinte();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (evento) => {
    // Sem a barrinha automática do Chrome: quem pede é o botão do app, na hora certa.
    evento.preventDefault();
    pedido = evento as PedidoInstalacao;
    atualizar();
  });
  window.addEventListener("appinstalled", () => {
    pedido = null;
    marcarInstalou();
    atualizar();
  });
  // No computador, a aba vira janela do app logo depois de instalar.
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", atualizar);
  atualizar();
}

/** Abre o pedido de instalação do navegador. Devolve se a pessoa aceitou. */
export async function pedirInstalacao(): Promise<boolean> {
  const atual = pedido;
  if (!atual) return false;
  // O evento só serve uma vez; se a pessoa recusar, o Chrome manda outro mais tarde.
  pedido = null;
  atualizar();
  await atual.prompt();
  const { outcome } = await atual.userChoice;
  if (outcome === "accepted") {
    marcarInstalou();
    atualizar();
  }
  return outcome === "accepted";
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => void ouvintes.delete(ouvinte);
}

/** Estado da instalação, que muda quando o navegador libera o pedido ou o app é instalado. */
export function useInstalacao(): EstadoInstalacao {
  return useSyncExternalStore(assinar, () => estado, () => estado);
}
