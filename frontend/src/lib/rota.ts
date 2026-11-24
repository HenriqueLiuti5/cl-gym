import { useEffect, useState } from "react";

/** Rotas por hash (#/treino/123): funcionam offline sem configurar o servidor. */
export function useRota(): string[] {
  const ler = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [partes, setPartes] = useState(ler);
  useEffect(() => {
    const aoMudar = () => {
      setPartes(ler());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);
  return partes;
}

export function ir(caminho: string): void {
  window.location.hash = caminho;
}
