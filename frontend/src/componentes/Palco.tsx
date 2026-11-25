// A área das telas (tudo menos a barra de abas), com o movimento de um app:
// - arrastar o dedo para o lado troca de aba (e de parte, na Evolução e na administração): a tela
//   segue o dedo e, ao soltar, a nova entra deslizando; sem tela daquele lado, ela volta sozinha;
// - no app instalado, arrastar da borda esquerda numa tela interna volta, como nos apps do iPhone
//   (o app instalado do iPhone não tem esse gesto; o do Android tem o dele, que chega aqui como
//   uma volta no histórico);
// - toda troca de tela desliza do lado certo, também ao tocar numa aba (lib/navegacao.ts).
// O arrasto não começa em campos, gráficos (lá ele mostra os valores), janelas e listas que rolam
// para o lado, e o toque em que ele começou não vira clique. "Reduzir movimento" desliga as animações.

import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

import { estaInstalado } from "../lib/instalar";
import { comResistencia, deveTrocar, mesmaTela, sentidoDaTransicao, telaVizinha } from "../lib/navegacao";

/** Quanto o dedo anda antes de decidir se é troca de tela (para o lado) ou rolagem. */
const FOLGA_PX = 10;
/** Perto da beira da tela, quem manda é o gesto do sistema (ou o de voltar, no app instalado). */
const BORDA_PX = 20;
const ENTRADA_MS = 240;
const SAIDA_MS = 150;
const VOLTA_MS = 200;
const SUAVE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** Onde o arrasto não começa. Gráficos e o que mais precisar do arrasto levam `data-sem-arrasto`. */
const SEM_ARRASTO = "input, textarea, select, [contenteditable], dialog, [data-sem-arrasto]";

const partes = (endereco: string) => endereco.split("/").filter(Boolean);

function reduzirMovimento(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** O que desliza: só o miolo (`data-pagina`) quando muda a parte da mesma tela; senão, tudo. */
function alvoDaTroca(palco: HTMLElement, de: string[], para: string[]): HTMLElement {
  return (mesmaTela(de, para) && palco.querySelector<HTMLElement>("[data-pagina]")) || palco;
}

function soltar(el: HTMLElement): void {
  el.style.transform = "";
  el.style.opacity = "";
  el.style.willChange = "";
}

/** Para as animações em curso e desfaz o deslocamento do arrasto. */
function parar(palco: HTMLElement): void {
  for (const el of [palco, ...palco.querySelectorAll<HTMLElement>("[data-pagina]")]) {
    for (const animacao of el.getAnimations()) animacao.cancel();
    soltar(el);
  }
}

/** Algum elemento entre o toque e o palco rola para o lado (ex.: os grupos musculares). */
function rolaParaOLado(alvo: Element, palco: HTMLElement): boolean {
  for (let el: Element | null = alvo; el && el !== palco; el = el.parentElement) {
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
  const opacity = alvo.style.opacity || "1";
  soltar(alvo);
  if (!transform || reduzirMovimento()) return;
  alvo.animate([{ transform, opacity }, { transform: "none", opacity: 1 }], { duration: VOLTA_MS, easing: SUAVE });
}

interface Gesto {
  id: number;
  x0: number;
  y0: number;
  /** Começou na borda esquerda de uma tela interna, no app instalado: arrastar volta. */
  voltar: string | null;
  arrastando: boolean;
  /** O que está seguindo o dedo. */
  alvo: HTMLElement | null;
  deslocamento: number;
  ultimoX: number;
  ultimoT: number;
  /** px/ms, suavizada (para o movimento rápido trocar mesmo curto). */
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
      const dx = evento.clientX - g.x0;
      const dy = evento.clientY - g.y0;
      if (!g.arrastando) {
        if (Math.hypot(dx, dy) < FOLGA_PX) return;
        // Mais para cima ou para baixo do que para o lado: é rolagem, fica com o navegador.
        if (Math.abs(dx) < Math.abs(dy) * 1.2 || (g.voltar && dx < 0)) {
          gesto = null;
          return;
        }
        g.arrastando = true;
        parar(palco);
      }

      const dt = evento.timeStamp - g.ultimoT;
      if (dt > 0) g.velocidade = 0.8 * ((evento.clientX - g.ultimoX) / dt) + 0.2 * g.velocidade;
      g.ultimoX = evento.clientX;
      g.ultimoT = evento.timeStamp;

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
      alvo.style.willChange = "transform, opacity";
      alvo.style.transform = `translate3d(${g.deslocamento}px, 0, 0)`;
      alvo.style.opacity = String(1 - Math.min(Math.abs(g.deslocamento) / largura(), 1) * 0.4);
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
      if (reduzirMovimento()) {
        ir();
        return;
      }
      // Termina de sair para o lado do dedo; a nova tela entra em useTransicao.
      const fim = Math.sign(g.deslocamento) * largura() * 0.5;
      const saida = alvo.animate(
        [
          { transform: alvo.style.transform, opacity: alvo.style.opacity || "1" },
          { transform: `translate3d(${fim}px, 0, 0)`, opacity: 0 },
        ],
        { duration: SAIDA_MS, easing: "ease-in", fill: "forwards" },
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

/** A tela nova entra deslizando do lado certo (pela direita ao avançar, pela esquerda ao voltar). */
function useTransicao(palcoRef: RefObject<HTMLDivElement | null>, rota: string[]): void {
  const anterior = useRef(rota);
  useLayoutEffect(() => {
    const de = anterior.current;
    anterior.current = rota;
    const palco = palcoRef.current;
    if (!palco || de.join("/") === rota.join("/")) return;
    parar(palco);
    const sentido = sentidoDaTransicao(de, rota);
    if (sentido === 0 || reduzirMovimento()) return;
    alvoDaTroca(palco, de, rota).animate(
      [
        { transform: `translate3d(${sentido * 24}%, 0, 0)`, opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: ENTRADA_MS, easing: SUAVE },
    );
  }, [palcoRef, rota]);
}

/**
 * `area` é onde o gesto vale: o <main> do App, que precisa de `touch-action: pan-y` (rolar para
 * cima e para baixo continua com o navegador; para o lado, com o app).
 */
export function Palco({ rota, area, children }: { rota: string[]; area: RefObject<HTMLElement | null>; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useTransicao(ref, rota);
  useArrastar(area, ref, rota);
  return <div ref={ref}>{children}</div>;
}
