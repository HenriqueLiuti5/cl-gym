import { useLiveQuery } from "dexie-react-hooks";

import { Demonstracao } from "../componentes/Demonstracao";
import { Botao, Cartao, Titulo } from "../componentes/ui";
import { db, salvar } from "../lib/db";
import { blocos } from "../lib/regras";
import { sincronizarEmBreve } from "../lib/sync";
import { comecarTreino } from "../lib/treino";
import type { FichaExercicio } from "../lib/tipos";

function Ajuste({ rotulo, valor, min, max, aoMudar }: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  aoMudar: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-sm text-slate-400">{rotulo}</span>
      <button type="button" aria-label={`Menos ${rotulo}`} className="h-9 w-9 rounded-lg bg-slate-800" disabled={valor <= min} onClick={() => aoMudar(valor - 1)}>
        −
      </button>
      <span className="w-8 text-center text-lg font-semibold">{valor}</span>
      <button type="button" aria-label={`Mais ${rotulo}`} className="h-9 w-9 rounded-lg bg-slate-800" disabled={valor >= max} onClick={() => aoMudar(valor + 1)}>
        +
      </button>
    </div>
  );
}

export function FichaTela({ fichaId }: { fichaId: string }) {
  const ficha = useLiveQuery(() => db.fichas.get(fichaId), [fichaId]);
  const itens = useLiveQuery(() => db.ficha_exercicios.where("ficha_id").equals(fichaId).toArray(), [fichaId]);
  const exercicios = useLiveQuery(() => db.exercicios.toArray(), []);
  if (!ficha || !itens || !exercicios) return null;

  const porId = new Map(exercicios.map((e) => [e.id, e]));
  const nome = (id: string) => porId.get(id)?.nome ?? "Exercício";
  const alterar = async (item: FichaExercicio, campos: Partial<FichaExercicio>) => {
    await salvar("ficha_exercicios", { ...item, ...campos });
    sincronizarEmBreve();
  };

  return (
    <div className="space-y-3">
      <Titulo voltar="#/">{ficha.nome}</Titulo>
      <Botao variante="principal" className="w-full" onClick={() => comecarTreino(ficha.id)}>
        Começar este treino
      </Botao>

      {blocos(itens).map((bloco) => (
        <div key={bloco[0]!.id} className={bloco.length > 1 ? "space-y-2 rounded-2xl border border-sky-800 p-2" : ""}>
          {bloco.length > 1 && (
            <p className="px-2 text-sm text-sky-300">
              Bi-set: uma série de cada, em sequência. Descanse só depois do par.
            </p>
          )}
          {bloco.map((item) => {
            const exercicio = porId.get(item.exercicio_id);
            return (
              <Cartao key={item.id} className="space-y-2">
                <p className="text-lg font-semibold">
                  {item.aquecimento && <span title="Aquecer antes">🔥 </span>}
                  {nome(item.exercicio_id)}
                </p>
                <p className="text-slate-300">
                  {item.series} séries de <strong>{item.alvo_reps}</strong> reps
                </p>
                {item.aquecimento && <p className="text-sm text-orange-300">🔥 Antes: 1×10 leve (~50% do peso). Não conta como série.</p>}
                {item.observacao && <p className="text-sm text-slate-400">💡 {item.observacao}</p>}
                {item.alternativas.length > 0 && (
                  <p className="text-sm text-slate-400">
                    Plano B: {item.alternativas.map(nome).join(" · ")}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                  <Ajuste rotulo="Séries" valor={item.series} min={1} max={20} aoMudar={(series) => alterar(item, { series })} />
                  <Ajuste rotulo="Alvo" valor={item.alvo_reps} min={1} max={100} aoMudar={(alvo_reps) => alterar(item, { alvo_reps })} />
                </div>
                {exercicio && <Demonstracao exercicio={exercicio} />}
              </Cartao>
            );
          })}
        </div>
      ))}
    </div>
  );
}
