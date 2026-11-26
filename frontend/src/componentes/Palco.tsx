// A área das telas (tudo menos a barra de abas), com o movimento de um app:
// - arrastar o dedo para o lado troca de aba (e de parte, na Evolução e na administração): a tela
//   segue o dedo e, ao soltar, ela e a nova andam juntas o resto do caminho, como páginas; sem
//   tela daquele lado, ela volta sozinha;
// - no app instalado, arrastar da borda esquerda numa tela interna volta, como nos apps do iPhone
//   (o app instalado do iPhone não tem esse gesto; o do Android tem o dele, que chega aqui como
//   uma volta no histórico);
// - toda troca de tela desliza do lado certo, também ao tocar numa aba (lib/navegacao.ts).
// A animação usa a View Transitions API (Chrome do Android, Safari 18 em diante): o navegador
// fotografa a tela de antes, monta a nova e anima as duas fotos fora da thread principal, sem
// engasgar nem piscar. Sem ela, a tela sai e a nova entra com animações comuns. O CSS fica no
// index.css ("Troca de tela"). O arrasto não começa em campos, gráficos (lá ele mostra os
// valores), janelas, listas que rolam para o lado e na barra de abas, e o toque em que ele
// começou não vira clique. "Reduzir movimento" desliga as animações.

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import { estaInstalado } from "../lib/instalar";
import { comResistencia, deveTrocar, duracaoDoArrasto, mesmaTela, sentidoDaTransicao, telaVizinha } from "../lib/navegacao";
import { definirTrocaDeTela } from "../lib/rota";

/** Quanto o dedo anda antes de decidir se é troca de tela (para o lado) ou rolagem. */
const FOLGA_PX = 10;
/** Perto da beira da tela, quem manda é o gesto do sistema (ou o de voltar, no app instalado). */
const BORDA_PX = 20;
/** Troca por toque (aba, link, voltar): um deslize curto com fade. */
const TOQUE_MS = 260;
/** Sem View Transitions: a tela solta sai, e a nova entra depois. */
const SAIDA_MS = 150;
const ENTRADA_MS = 240;
const VOLTA_MS = 200;
const SUAVE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** Onde o arrasto não começa. Gráficos e o que mais precisar do arrasto levam `data-sem-arrasto`. */
const SEM_ARRASTO = "input, textarea, select, [contenteditable], dialog, [data-sem-arrasto]";
const VARIAVEIS_DA_TROCA = ["--troca-sai", "--troca-entra", "--troca-duracao"];

const partes = (endereco: string) => endereco.split("/").filter(Boolean);

function reduzirMovimento(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function temViewTransitions(): boolean {
  return typeof document.startViewTransition === "function";
}

/** O que desliza: só o miolo (`data-pagina`) quando muda a parte da mesma tela; senão, tudo. */
function alvoDaTroca(palco: HTMLElement, de: string[], para: string[]): HTMLElement {
  return (mesmaTela(de, para) && palco.querySelector<HTMLElement>("[data-pagina]")) || palco;
}

function soltar(el: HTMLElement): void {
  el.style.transform = "";
  el.style.willChange = "";
}

/** Para as animações em curso e desfaz o deslocamento do arrasto. */
function parar(palco: HTMLElement): void {
  for (const el of [palco, ...palco.querySelectorAll<HTMLElement>("[data-pagina]")]) {
    for (const animacao of el.getAnimations()) animacao.cancel();
    soltar(el);
  }
}

/** Algum elemento entre o toque e a área do gesto rola para o lado (ex.: os grupos musculares). */
function rolaParaOLado(alvo: Element, area: HTMLElement): boolean {
  for (let el: Element | null = alvo; el && el !== area; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const { overflowX } = getComputedStyle(el);
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
  }
  return false;
}

/** O clique do toque em que o arrasto começou (num botão ou numa linha) não faz nada. */
function engolirClique(): void {
  const engolir = (evento: MouseEvent) => {
    evento.preventDefault();
    evento.stopPropagation();
  };
  window.addEventListener("click", engolir, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", engolir, { capture: true }), 400);
}

/** Desliza de volta para o lugar (soltou antes de trocar, ou não há tela daquele lado). */
function voltarAoLugar(alvo: HTMLElement): void {
  const transform = alvo.style.transform;
  soltar(alvo);
  if (!transform || reduzirMovimento()) return;
  alvo.animate([{ transform }, { transform: "none" }], { duration: VOLTA_MS, easing: SUAVE });
}

/**
 * Tela nova começa do topo. Outra parte da mesma tela fica onde está, mas, se já tinha rolado além
 * do começo do miolo, para logo abaixo do que fica preso no topo (segmentos, barra).
 */
function rolarParaATela(palco: HTMLElement, parte: boolean): void {
  if (!parte) {
    window.scrollTo(0, 0);
    return;
  }
  const pagina = palco.querySelector<HTMLElement>("[data-pagina]");
  if (!pagina) return;
  let preso = 0;
  for (const el of palco.querySelectorAll<HTMLElement>("[data-fixo-na-troca]")) {
    const estilo = getComputedStyle(el);
    if (estilo.position === "sticky") preso = Math.max(preso, (Number.parseFloat(estilo.top) || 0) + el.offsetHeight);
  }
  const inicio = pagina.getBoundingClientRect().top + window.scrollY - preso;
  if (window.scrollY > inicio) window.scrollTo(0, Math.max(0, inicio));
}

/**
 * Espera a tela nova aparecer antes da foto: os dados chegam do IndexedDB logo depois de ela
 * montar, e até lá ela fica vazia. Termina quando o palco tem conteúdo e passa um instante sem
 * mudar, ou em 300 ms no máximo.
 */
function sossegar(palco: HTMLElement): Promise<void> {
  return new Promise((pronto) => {
    let calma: ReturnType<typeof setTimeout> | undefined;
    const acabar = () => {
      observador.disconnect();
      clearTimeout(calma);
      clearTimeout(limite);
      pronto();
    };
    const esperar = () => {
      clearTimeout(calma);
      if (palco.childElementCount > 0) calma = setTimeout(acabar, 24);
    };
    const observador = new MutationObserver(esperar);
    const limite = setTimeout(acabar, 300);
    observador.observe(palco, { childList: true, subtree: true, characterData: true });
    esperar();
  });
}

/** O arrasto que acabou de trocar de tela: onde a tela parou e a que velocidade o dedo ia. */
let arrastoSolto: { deslocamento: number; velocidade: number } | null = null;
/** A troca mais recente: uma anterior que termine depois não apaga o CSS desta. */
let trocaAtual = 0;

/** Mostra a tela nova (`aplicar`) com a animação certa. Chamada pela rota (lib/rota.ts). */
function trocar(palco: HTMLElement, de: string[], para: string[], aplicar: () => void): void {
  const arrasto = arrastoSolto;
  arrastoSolto = null;
  const parte = mesmaTela(de, para);
  const sentido = sentidoDaTransicao(de, para);
  const mostrar = () => {
    parar(palco);
    aplicar();
    rolarParaATela(palco, parte);
  };

  if (sentido === 0 || reduzirMovimento()) {
    mostrar();
    return;
  }
  if (!temViewTransitions()) {
    mostrar();
    alvoDaTroca(palco, de, para).animate(
      [
        { transform: `translate3d(${sentido * 24}%, 0, 0)`, opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: ENTRADA_MS, easing: SUAVE },
    );
    return;
  }

  // Arrasto: as duas telas andam juntas o que falta, a partir de onde o dedo largou a tela.
  // Toque: a tela sai um quarto para o lado e apaga, e a nova vem do outro lado acendendo.
  const raiz = document.documentElement;
  const id = ++trocaAtual;
  if (arrasto) {
    const resto = Math.round(Math.max(0, window.innerWidth - Math.abs(arrasto.deslocamento)));
    raiz.dataset.troca = "arrasto";
    raiz.style.setProperty("--troca-sai", `${-sentido * resto}px`);
    raiz.style.setProperty("--troca-entra", `${sentido * resto}px`);
    raiz.style.setProperty("--troca-duracao", `${duracaoDoArrasto(resto, arrasto.velocidade)}ms`);
  } else {
    raiz.dataset.troca = "toque";
    raiz.style.setProperty("--troca-sai", `${-sentido * 25}%`);
    raiz.style.setProperty("--troca-entra", `${sentido * 25}%`);
    raiz.style.setProperty("--troca-duracao", `${TOQUE_MS}ms`);
  }
  raiz.classList.toggle("troca-de-parte", parte);

  const limpar = () => {
    if (id !== trocaAtual) return;
    delete raiz.dataset.troca;
    raiz.classList.remove("troca-de-parte");
    for (const nome of VARIAVEIS_DA_TROCA) raiz.style.removeProperty(nome);
  };
  const transicao = document.startViewTransition(async () => {
    mostrar();
    await sossegar(palco);
  });
  transicao.ready.catch(() => undefined);
  transicao.updateCallbackDone.catch(() => undefined);
  transicao.finished.then(limpar, limpar);
}

/** Interessado no gesto (pointerdown): onde começou e o que pode acontecer. */
interface Gesto {
  id: number;
  x0: number;
  y0: number;
  /** Começou na borda esquerda de uma tela interna, no app instalado: arrastar volta para cá. */
  voltar: string | null;
  arrastando: boolean;
  /** Onde o dedo estava quando o gesto virou arrasto: a tela anda a partir daí, sem pulo. */
  xTrava: number;
  /** O que está seguindo o dedo. */
  alvo: HTMLElement | null;
  deslocamento: number;
  ultimoX: number;
  ultimoT: number;
  /** px/ms, suavizada (para o movimento rápido trocar mesmo curto e o fim seguir o dedo). */
  velocidade: number;
}

/** Para onde o arrasto leva, no sentido em que o dedo está (null: não há tela daquele lado). */
function destino(gesto: Gesto, rota: string[], dx: number): string | null {
  if (gesto.voltar) return dx > 0 ? gesto.voltar : null;
  const vizinha = telaVizinha(rota, dx < 0 ? 1 : -1);
  return vizinha === null ? null : `#/${vizinha}`;
}

/**
 * O gesto vale na `area` toda (com as margens dos lados, onde começa o voltar pela borda); o que se
 * mexe é o `palco`, dentro dela.
 */
function useArrastar(areaRef: RefObject<HTMLElement | null>, palcoRef: RefObject<HTMLDivElement | null>, rota: string[]): void {
  const rotaRef = useRef(rota);
  useEffect(() => {
    rotaRef.current = rota;
  }, [rota]);

  useEffect(() => {
    const elementoArea = areaRef.current;
    const elementoPalco = palcoRef.current;
    if (!elementoArea || !elementoPalco) return;
    const area: HTMLElement = elementoArea;
    const palco: HTMLDivElement = elementoPalco;
    let gesto: Gesto | null = null;
    const largura = () => palco.clientWidth || window.innerWidth;

    function aoTocar(evento: PointerEvent) {
      gesto = null;
      arrastoSolto = null;
      if (evento.pointerType !== "touch" || !evento.isPrimary) return;
      const tocado = evento.target as Element;
      if (tocado.closest(SEM_ARRASTO) || rolaParaOLado(tocado, area)) return;
      const rota = rotaRef.current;
      const naBordaEsquerda = evento.clientX <= BORDA_PX;
      const voltar = naBordaEsquerda && estaInstalado() ? palco.querySelector<HTMLAnchorElement>("a[data-voltar]") : null;
      if (!voltar && (naBordaEsquerda || evento.clientX >= window.innerWidth - BORDA_PX)) return;
      if (!voltar && telaVizinha(rota, 1) === null && telaVizinha(rota, -1) === null) return;
      gesto = {
        id: evento.pointerId,
        x0: evento.clientX,
        y0: evento.clientY,
        voltar: voltar?.getAttribute("href") ?? null,
        arrastando: false,
        xTrava: evento.clientX,
        alvo: null,
        deslocamento: 0,
        ultimoX: evento.clientX,
        ultimoT: evento.timeStamp,
        velocidade: 0,
      };
    }

    function aoMover(evento: PointerEvent) {
      const g = gesto;
      if (!g || evento.pointerId !== g.id) return;
      if (!g.arrastando) {
        const dx = evento.clientX - g.x0;
        const dy = evento.clientY - g.y0;
        if (Math.hypot(dx, dy) < FOLGA_PX) return;
        // Mais para cima ou para baixo do que para o lado: é rolagem, fica com o navegador.
        if (Math.abs(dx) < Math.abs(dy) * 1.2 || (g.voltar && dx < 0)) {
          gesto = null;
          return;
        }
        g.arrastando = true;
        g.xTrava = evento.clientX;
        parar(palco);
      }

      const dt = evento.timeStamp - g.ultimoT;
      if (dt > 0) g.velocidade = 0.8 * ((evento.clientX - g.ultimoX) / dt) + 0.2 * g.velocidade;
      g.ultimoX = evento.clientX;
      g.ultimoT = evento.timeStamp;

      const dx = evento.clientX - g.xTrava;
      const rota = rotaRef.current;
      const para = destino(g, rota, dx);
      const alvo = g.voltar
        ? palco
        : para
          ? alvoDaTroca(palco, rota, partes(para.slice(2)))
          : (palco.querySelector<HTMLElement>("[data-pagina]") ?? palco);
      if (g.alvo && g.alvo !== alvo) soltar(g.alvo);
      g.alvo = alvo;
      g.deslocamento = para ? dx : comResistencia(dx);
      alvo.style.willChange = "transform";
      alvo.style.transform = `translate3d(${g.deslocamento}px, 0, 0)`;
    }

    function aoSoltar(evento: PointerEvent) {
      const g = gesto;
      if (!g || evento.pointerId !== g.id) return;
      gesto = null;
      if (!g.arrastando || !g.alvo) return;
      engolirClique();
      const alvo = g.alvo;
      const para = destino(g, rotaRef.current, g.deslocamento);
      if (!para || !deveTrocar(g.deslocamento, largura(), g.velocidade)) {
        voltarAoLugar(alvo);
        return;
      }
      // Muda o endereço (e não um clique no link de voltar: o clique seria engolido acima).
      const ir = () => {
        window.location.hash = para;
      };
      if (temViewTransitions() && !reduzirMovimento()) {
        // A tela fica onde o dedo a largou até a foto; daí as duas andam juntas (trocar).
        arrastoSolto = { deslocamento: g.deslocamento, velocidade: g.velocidade };
        ir();
        return;
      }
      if (reduzirMovimento()) {
        ir();
        return;
      }
      // Sem View Transitions: termina de sair para o lado do dedo; a nova entra em `trocar`.
      const fim = Math.sign(g.deslocamento) * largura() * 0.5;
      const saida = alvo.animate(
        [{ transform: alvo.style.transform }, { transform: `translate3d(${fim}px, 0, 0)`, opacity: 0 }],
        { duration: SAIDA_MS, easing: "ease-out", fill: "forwards" },
      );
      saida.onfinish = ir;
    }

    function aoCancelar(evento: PointerEvent) {
      const g = gesto;
      if (!g || evento.pointerId !== g.id) return;
      gesto = null;
      if (g.arrastando && g.alvo) voltarAoLugar(g.alvo);
    }

    area.addEventListener("pointerdown", aoTocar);
    area.addEventListener("pointermove", aoMover);
    area.addEventListener("pointerup", aoSoltar);
    area.addEventListener("pointercancel", aoCancelar);
    return () => {
      area.removeEventListener("pointerdown", aoTocar);
      area.removeEventListener("pointermove", aoMover);
      area.removeEventListener("pointerup", aoSoltar);
      area.removeEventListener("pointercancel", aoCancelar);
    };
  }, [areaRef, palcoRef]);
}

/** Enquanto o palco existe (com a conta aberta), é ele quem anima as trocas de tela. */
function useTrocaDeTela(palcoRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const palco = palcoRef.current;
    if (!palco) return;
    definirTrocaDeTela((de, para, aplicar) => trocar(palco, de, para, aplicar));
    return () => definirTrocaDeTela(null);
  }, [palcoRef]);
}

/**
 * `area` é onde o gesto vale: o <main> do App, que precisa de `touch-action: pan-y` (rolar para
 * cima e para baixo continua com o navegador; para o lado, com o app).
 */
export function Palco({ rota, area, children }: { rota: string[]; area: RefObject<HTMLElement | null>; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useTrocaDeTela(ref);
  useArrastar(area, ref, rota);
  return <div ref={ref}>{children}</div>;
}
