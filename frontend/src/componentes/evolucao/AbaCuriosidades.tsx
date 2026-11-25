import { curiosidades, GRUPOS_CURIOSIDADE } from "../../lib/curiosidades";
import { Grupo } from "../ui";
import { Vazio } from "./base";
import type { DadosEvolucao } from "./dados";

export function AbaCuriosidades({ d }: { d: DadosEvolucao }) {
  const lista = curiosidades({ treinos: d.treinos, exercicios: d.exercicios, itens: d.itens, registros: d.registros, hoje: d.hoje });
  if (!lista.length) return <Vazio>Treine e lance o registro do dia: as curiosidades aparecem aqui.</Vazio>;
  return (
    <div className="space-y-6">
      <p className="px-1 text-[15px] leading-snug text-texto-2">
        Números do seu histórico. As comparações são aproximadas, só para dar uma ideia do tamanho.
      </p>
      {GRUPOS_CURIOSIDADE.map((grupo) => {
        const doGrupo = lista.filter((c) => c.grupo === grupo);
        if (!doGrupo.length) return null;
        return (
          <Grupo key={grupo} titulo={grupo}>
            {doGrupo.map((c) => (
              <div key={c.titulo} className="px-4 py-3.5">
                <p className="text-[13px] text-texto-2">{c.titulo}</p>
                <p className="mt-0.5 text-[20px] leading-tight font-semibold">{c.valor}</p>
                <p className="mt-1 text-[15px] leading-snug text-texto-2">{c.detalhe}</p>
              </div>
            ))}
          </Grupo>
        );
      })}
    </div>
  );
}
