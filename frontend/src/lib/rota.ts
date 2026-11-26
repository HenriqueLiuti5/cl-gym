import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

/**
 * Como trocar de tela. O Palco (componentes/Palco.tsx) registra a dele, que anima a troca; sem ela
 * (login, boas-vindas), troca direto e volta ao topo. `aplicar` mostra a tela nova na hora (de
 * forma síncrona, para a animação fotografar a tela de antes e a de depois).
 */
export type TrocaDeTela = (de: string[], para: string[], aplicar: () => void) => void;

let trocaDeTela: TrocaDeTela | null = null;

export function definirTrocaDeTela(funcao: TrocaDeTela | null): void {
  trocaDeTela = funcao;
}

const ler = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);

/** Rotas por hash (#/treino/123): funcionam offline sem configurar o servidor. */
export function useRota(): string[] {
  const [partes, setPartes] = useState(ler);
  useEffect(() => {
    let atual = ler();
    const aoMudar = () => {
      const de = atual;
      const para = ler();
      atual = para;
      const aplicar = () => flushSync(() => setPartes(para));
      if (trocaDeTela) {
        trocaDeTela(de, para, aplicar);
      } else {
        aplicar();
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);
  return partes;
}

export function ir(caminho: string): void {
  window.location.hash = caminho;
}
