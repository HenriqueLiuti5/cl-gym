import { useLiveQuery } from "dexie-react-hooks";

import { BotaoComecar } from "../componentes/BotaoComecar";
import { Demonstracao } from "../componentes/Demonstracao";
import { BarraTopo, Botao } from "../componentes/ui";
import { db } from "../lib/db";
import { itensDaFicha } from "../lib/fichas";
import { ir } from "../lib/rota";
import type { Exercicio, FichaExercicio } from "../lib/tipos";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function ItemFicha({ item, porId }: { item: FichaExercicio; porId: Map<string, Exercicio> }) {
  const exercicio = porId.get(item.exercicio_id);
  const nome = (id: string) => porId.get(id)?.nome ?? "Exercício";

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
          <strong className="font-semibold text-texto">Aquecimento:</strong> antes, 1×10 leve (uns 50% do peso). Não conta como série.
        </p>
      )}
      {item.observacao && <p className="text-[14px] leading-snug text-texto-2">{item.observacao}</p>}
      {item.alternativas.length > 0 && (
        <p className="text-[14px] leading-snug text-texto-3">Plano B: {item.alternativas.map(nome).join(", ")}</p>
      )}
      {exercicio && <Demonstracao exercicio={exercicio} />}
    </div>
  );
}

export function FichaTela({ fichaId }: { fichaId: string }) {
  // null: não existe neste aparelho; undefined: ainda carregando.
  const ficha = useLiveQuery(async () => (await db.fichas.get(fichaId)) ?? null, [fichaId]);
  const itens = useLiveQuery(() => db.ficha_exercicios.where("ficha_id").equals(fichaId).toArray(), [fichaId]);
  const exercicios = useLiveQuery(() => db.exercicios.toArray(), []);
  if (ficha === undefined || !itens || !exercicios) return null;

  if (!ficha || ficha.excluido) {
    return (
      <div>
        <BarraTopo voltar="#/" titulo={ficha ? "Treino apagado" : "Treino não encontrado"} />
        <p className="px-1 text-[15px] text-texto-2">
          {ficha ? "Este treino foi apagado. Os treinos já feitos com ele continuam no histórico." : "Este treino não está neste aparelho."}
        </p>
      </div>
    );
  }

  const porId = new Map(exercicios.map((e) => [e.id, e]));
  const ativos = itensDaFicha(itens);
  const series = ativos.reduce((soma, i) => soma + i.series, 0);

  return (
    <div>
      <BarraTopo
        voltar="#/"
        titulo={ficha.nome}
        acao={
          <a href={`#/editar/${ficha.id}`} className="grid h-11 place-items-center rounded-lg px-2 text-[17px] text-acento active:bg-campo">
            Editar
          </a>
        }
      />
      {ativos.length === 0 ? (
        <div className="rounded-xl bg-superficie p-4">
          <p className="text-[15px] leading-snug text-texto-2">Este treino ainda não tem exercícios.</p>
          <Botao variante="principal" className="mt-4 w-full" onClick={() => ir(`/editar/${ficha.id}`)}>
            Adicionar exercícios
          </Botao>
        </div>
      ) : (
        <>
          <p className="mb-4 px-1 text-[15px] text-texto-2">
            {plural(ativos.length, "exercício", "exercícios")} · {plural(series, "série", "séries")}
          </p>
          <BotaoComecar fichaId={ficha.id} className="w-full" />
          <div className="mt-6 space-y-3">
            {ativos.map((item) => (
              <section key={item.id} className="overflow-hidden rounded-xl bg-superficie">
                <ItemFicha item={item} porId={porId} />
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
