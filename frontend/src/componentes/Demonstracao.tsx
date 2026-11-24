import { useState } from "react";

import type { Exercicio } from "../lib/tipos";

/** Imagens (alternando início/fim), passos e link de busca no YouTube. */
export function Demonstracao({ exercicio }: { exercicio: Exercicio }) {
  const [aberta, setAberta] = useState(false);
  const [quadro, setQuadro] = useState(0);
  const busca = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercicio.nome} execução`)}`;

  if (!aberta) {
    return (
      <button type="button" className="text-sm text-emerald-400 underline" onClick={() => setAberta(true)}>
        Como fazer
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-slate-950 p-3">
      {exercicio.imagens.length > 0 && (
        <button type="button" className="block w-full" onClick={() => setQuadro((q) => (q + 1) % exercicio.imagens.length)}>
          <img
            src={exercicio.imagens[quadro]}
            alt={`${exercicio.nome}, posição ${quadro + 1}`}
            className="mx-auto max-h-56 rounded-lg bg-white object-contain"
            loading="lazy"
          />
          {exercicio.imagens.length > 1 && <span className="text-xs text-slate-500">Toque para ver o movimento</span>}
        </button>
      )}
      {exercicio.instrucoes.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
          {exercicio.instrucoes.map((passo) => (
            <li key={passo}>{passo}</li>
          ))}
        </ol>
      )}
      <div className="flex justify-between text-sm">
        <a href={exercicio.midia_url ?? busca} target="_blank" rel="noreferrer" className="text-emerald-400 underline">
          Ver vídeo no YouTube
        </a>
        <button type="button" className="text-slate-400" onClick={() => setAberta(false)}>
          Fechar
        </button>
      </div>
    </div>
  );
}
