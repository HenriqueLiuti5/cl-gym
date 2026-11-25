import { useState } from "react";

import type { Exercicio } from "../lib/tipos";
import { Icone } from "./icones";

/** Imagens (alternando início/fim), passos e link de busca no YouTube. */
export function Demonstracao({ exercicio }: { exercicio: Exercicio }) {
  const [aberta, setAberta] = useState(false);
  const [quadro, setQuadro] = useState(0);
  const busca = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercicio.nome} execução`)}`;

  return (
    <div>
      <button
        type="button"
        aria-expanded={aberta}
        onClick={() => setAberta((a) => !a)}
        className="-ml-1 flex h-10 items-center gap-1 rounded-lg px-1 text-[15px] font-medium text-acento active:bg-acento-suave"
      >
        Como fazer
        <Icone nome="abaixo" className={`h-4 w-4 ${aberta ? "rotate-180" : ""}`} />
      </button>
      {aberta && (
        <div className="mt-1 space-y-3 rounded-lg bg-campo p-3">
          {exercicio.imagens.length > 0 && (
            <button type="button" className="block w-full" onClick={() => setQuadro((q) => (q + 1) % exercicio.imagens.length)}>
              <img
                src={exercicio.imagens[quadro]}
                alt={`${exercicio.nome}, posição ${quadro + 1}`}
                className="mx-auto max-h-56 rounded-md bg-white object-contain"
                loading="lazy"
              />
              {exercicio.imagens.length > 1 && (
                <span className="mt-1.5 block text-center text-[13px] text-texto-3">Toque na imagem para ver o movimento</span>
              )}
            </button>
          )}
          {exercicio.instrucoes.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5 text-[15px] leading-snug text-texto-2">
              {exercicio.instrucoes.map((passo) => (
                <li key={passo}>{passo}</li>
              ))}
            </ol>
          )}
          <a
            href={exercicio.midia_url ?? busca}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[15px] font-medium text-acento"
          >
            Ver vídeo no YouTube
            <Icone nome="avancar" className="h-4 w-4" />
          </a>
        </div>
      )}
    </div>
  );
}
