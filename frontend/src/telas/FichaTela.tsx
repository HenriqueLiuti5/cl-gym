import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

import { BotaoComecar } from "../componentes/BotaoComecar";
import { Demonstracao } from "../componentes/Demonstracao";
import { Icone } from "../componentes/icones";
import { BarraTopo, Etiqueta } from "../componentes/ui";
import { db, salvar } from "../lib/db";
import { blocos } from "../lib/regras";
import { sincronizarEmBreve } from "../lib/sync";
import type { Exercicio, FichaExercicio } from "../lib/tipos";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function Ajuste({ rotulo, valor, min, max, aoMudar }: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  aoMudar: (v: number) => void;
}) {
  const botao = "grid h-10 w-10 place-items-center rounded-lg bg-campo text-texto active:opacity-75 disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[15px] text-texto-2">{rotulo}</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={`Menos ${rotulo.toLowerCase()}`} className={botao} disabled={valor <= min} onClick={() => aoMudar(valor - 1)}>
          <Icone nome="menos" className="h-4.5 w-4.5" />
        </button>
        <span className="w-10 text-center text-[17px] font-semibold tabular-nums">{valor}</span>
        <button type="button" aria-label={`Mais ${rotulo.toLowerCase()}`} className={botao} disabled={valor >= max} onClick={() => aoMudar(valor + 1)}>
          <Icone nome="mais" className="h-4.5 w-4.5" />
        </button>
      </div>
    </div>
  );
}

function ItemFicha({ item, porId, editando }: { item: FichaExercicio; porId: Map<string, Exercicio>; editando: boolean }) {
  const exercicio = porId.get(item.exercicio_id);
  const nome = (id: string) => porId.get(id)?.nome ?? "Exercício";
  const alterar = async (campos: Partial<FichaExercicio>) => {
    await salvar("ficha_exercicios", { ...item, ...campos });
    sincronizarEmBreve();
  };

  return (
    <div className="space-y-2 p-4">
      <div>
        <p className="text-[17px] leading-snug font-semibold">{nome(item.exercicio_id)}</p>
        <p className="mt-0.5 text-[15px] text-texto-2">
          {plural(item.series, "série", "séries")} × {item.alvo_reps} reps
        </p>
      </div>
      {item.aquecimento && (
        <p className="text-[14px] leading-snug text-texto-2">
          <Etiqueta tom="aviso">Aquecimento</Etiqueta> Antes, 1×10 leve (uns 50% do peso). Não conta como série.
        </p>
      )}
      {item.observacao && <p className="text-[14px] leading-snug text-texto-2">{item.observacao}</p>}
      {item.alternativas.length > 0 && (
        <p className="text-[14px] leading-snug text-texto-3">Plano B: {item.alternativas.map(nome).join(", ")}</p>
      )}
      {editando && (
        <div className="space-y-2 rounded-lg border border-linha p-3">
          <Ajuste rotulo="Séries" valor={item.series} min={1} max={20} aoMudar={(series) => void alterar({ series })} />
          <Ajuste rotulo="Alvo de repetições" valor={item.alvo_reps} min={1} max={100} aoMudar={(alvo_reps) => void alterar({ alvo_reps })} />
        </div>
      )}
      {exercicio && <Demonstracao exercicio={exercicio} />}
    </div>
  );
}

export function FichaTela({ fichaId }: { fichaId: string }) {
  const ficha = useLiveQuery(() => db.fichas.get(fichaId), [fichaId]);
  const itens = useLiveQuery(() => db.ficha_exercicios.where("ficha_id").equals(fichaId).toArray(), [fichaId]);
  const exercicios = useLiveQuery(() => db.exercicios.toArray(), []);
  const [editando, setEditando] = useState(false);
  if (!ficha || !itens || !exercicios) return null;

  const porId = new Map(exercicios.map((e) => [e.id, e]));
  const lista = blocos(itens);
  const ativos = lista.flat();
  const series = ativos.reduce((soma, i) => soma + i.series, 0);

  return (
    <div>
      <BarraTopo
        voltar="#/"
        titulo={ficha.nome}
        acao={
          <button type="button" onClick={() => setEditando((e) => !e)} className="h-11 rounded-lg px-2 text-[17px] text-acento active:bg-campo">
            {editando ? "Pronto" : "Editar"}
          </button>
        }
      />
      <p className="mb-4 px-1 text-[15px] text-texto-2">
        {plural(ativos.length, "exercício", "exercícios")} · {plural(series, "série", "séries")}
      </p>
      {editando ? (
        <p className="rounded-lg bg-campo px-3 py-2.5 text-[15px] leading-snug text-texto-2">
          Ajuste as séries e o alvo de repetições. Vale para os próximos treinos desta ficha.
        </p>
      ) : (
        <BotaoComecar fichaId={ficha.id} className="w-full" />
      )}

      <div className="mt-6 space-y-3">
        {lista.map((bloco) => (
          <section key={bloco[0]!.id} className="overflow-hidden rounded-xl bg-superficie">
            {bloco.length > 1 && (
              <div className="flex items-center gap-2 border-b border-linha px-4 py-2.5">
                <Etiqueta>Bi-set</Etiqueta>
                <p className="text-[13px] leading-snug text-texto-2">Uma série de cada, em sequência. Descanse depois do par.</p>
              </div>
            )}
            <div className="lista">
              {bloco.map((item) => (
                <ItemFicha key={item.id} item={item} porId={porId} editando={editando} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
