import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

import { Demonstracao } from "../componentes/Demonstracao";
import { Aviso, Botao, Cartao, Titulo } from "../componentes/ui";
import { formatarData, formatarKg, lerNumero } from "../lib/formato";
import { db } from "../lib/db";
import { avisoProgressao, blocos, proximaOpcao, ultimaVez } from "../lib/regras";
import { apagarSerie, cancelarTreino, gravarSerie, terminarTreino } from "../lib/treino";
import type { Exercicio, FichaExercicio, Serie, Sessao } from "../lib/tipos";

const estiloNumero =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-center text-lg outline-none focus:border-emerald-400";

function LinhaSerie({
  numero,
  serie,
  cargaSugerida,
  alvo,
  outroExercicio,
  aoGravar,
  aoApagar,
}: {
  numero: number;
  serie?: Serie;
  cargaSugerida: number | null;
  alvo: number;
  outroExercicio?: string;
  aoGravar: (carga: number, reps: number) => void;
  aoApagar?: () => void;
}) {
  // null = o campo ainda não foi mexido: mostra a carga sugerida (mesmo peso da série anterior).
  const [cargaDigitada, setCarga] = useState<string | null>(serie ? String(serie.carga_kg) : null);
  const carga = cargaDigitada ?? (cargaSugerida !== null ? String(cargaSugerida) : "");
  const [reps, setReps] = useState(serie ? String(serie.repeticoes) : "");
  const cargaNum = lerNumero(carga);
  const repsNum = lerNumero(reps);
  // Mesmos limites do servidor: um valor fora disso travaria a sincronização.
  const valido =
    cargaNum !== null &&
    cargaNum >= 0 &&
    cargaNum <= 1000 &&
    repsNum !== null &&
    Number.isInteger(repsNum) &&
    repsNum >= 0 &&
    repsNum <= 1000;
  const mudou = !serie || serie.carga_kg !== cargaNum || serie.repeticoes !== repsNum;

  return (
    <div className={`grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 ${serie && !mudou ? "opacity-90" : ""}`}>
      <span className={`text-center font-semibold ${serie ? "text-emerald-400" : "text-slate-500"}`}>{numero}</span>
      <input
        className={estiloNumero}
        inputMode="decimal"
        aria-label={`Carga da série ${numero} (kg)`}
        placeholder="kg"
        value={carga}
        onChange={(e) => setCarga(e.target.value)}
      />
      <input
        className={estiloNumero}
        inputMode="numeric"
        aria-label={`Repetições da série ${numero}`}
        placeholder={String(alvo)}
        value={reps}
        onChange={(e) => setReps(e.target.value)}
      />
      {serie && !mudou ? (
        <button type="button" className="h-11 rounded-lg text-slate-500" aria-label={`Apagar série ${numero}`} onClick={aoApagar}>
          ✕
        </button>
      ) : (
        <button
          type="button"
          className="h-11 rounded-lg bg-emerald-500 text-xl font-bold text-slate-950 disabled:opacity-30"
          aria-label={`Gravar série ${numero}`}
          disabled={!valido}
          onClick={() => aoGravar(cargaNum!, repsNum!)}
        >
          ✓
        </button>
      )}
      {outroExercicio && <span className="col-span-4 -mt-1 pl-10 text-xs text-slate-500">feita no {outroExercicio}</span>}
    </div>
  );
}

function ItemTreino({
  item,
  sessao,
  exercicios,
  todasSeries,
  sessoes,
}: {
  item: FichaExercicio;
  sessao: Sessao;
  exercicios: Map<string, Exercicio>;
  todasSeries: Serie[];
  sessoes: Sessao[];
}) {
  const doItem = todasSeries
    .filter((s) => s.sessao_id === sessao.id && s.ficha_exercicio_id === item.id && !s.excluido)
    .sort((a, b) => a.numero - b.numero);
  const [escolha, setEscolha] = useState<string | null>(null);
  const [extras, setExtras] = useState(0);
  const atual = escolha ?? doItem.at(-1)?.exercicio_id ?? item.exercicio_id;
  const exercicio = exercicios.get(atual);
  const nome = (id: string) => exercicios.get(id)?.nome ?? "Exercício";

  const ultima = ultimaVez(atual, todasSeries, sessoes, sessao.id);
  const aviso = ultima ? avisoProgressao(item.alvo_reps, ultima.series) : null;
  const linhas = Math.max(item.series + extras, doItem.length);
  const ultimaCargaHoje = [...doItem].reverse().find((s) => s.exercicio_id === atual)?.carga_kg;
  const cargaSugerida = ultimaCargaHoje ?? ultima?.series[0]?.carga_kg ?? null;
  const feitas = doItem.length;

  return (
    <Cartao className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg leading-tight font-semibold">
            {item.aquecimento && <span title="Aquecer antes">🔥 </span>}
            {nome(atual)}
          </p>
          {atual !== item.exercicio_id && <p className="text-xs text-slate-400">no lugar de {nome(item.exercicio_id)}</p>}
          <p className="text-sm text-slate-300">
            {item.series} séries · alvo <strong className="text-base text-white">{item.alvo_reps}</strong> reps
            <span className="text-slate-500"> · {feitas}/{item.series} feitas</span>
          </p>
        </div>
        {item.alternativas.length > 0 && (
          <Botao className="shrink-0 px-3 py-2 text-sm" onClick={() => setEscolha(proximaOpcao(item, atual))}>
            {atual === item.exercicio_id ? "Plano B" : "Trocar"}
          </Botao>
        )}
      </div>

      {item.aquecimento && (
        <p className="text-sm text-orange-300">🔥 Antes: 1×10 leve (~50% do peso), sem descanso. Não conta como série.</p>
      )}
      {item.observacao && atual === item.exercicio_id && <p className="text-sm text-slate-400">💡 {item.observacao}</p>}

      {ultima ? (
        <p className="text-sm text-slate-300">
          <span className="text-slate-500">Última vez ({formatarData(ultima.sessao.iniciada_em)}):</span>{" "}
          {ultima.series.map((s) => `${formatarKg(s.carga_kg)} × ${s.repeticoes}`).join(" · ")}
        </p>
      ) : (
        <p className="text-sm text-slate-500">Primeira vez: ache um peso que dê {item.alvo_reps} reps parando a 1–2 da falha.</p>
      )}
      {aviso?.sobe && <Aviso tipo="bom">⬆️ Sobe o peso: na última vez a 1ª série passou 2 do alvo.</Aviso>}
      {aviso?.pesado && <Aviso tipo="ruim">⬇️ Pesado demais: alguma série ficou 2 ou mais abaixo do alvo (ou o descanso foi curto).</Aviso>}

      <div className="space-y-2">
        <div className="grid grid-cols-[2rem_1fr_1fr_3rem] gap-2 text-center text-xs text-slate-500">
          <span>#</span>
          <span>kg</span>
          <span>reps</span>
          <span />
        </div>
        {Array.from({ length: linhas }, (_, i) => {
          const numero = i + 1;
          const serie = doItem.find((s) => s.numero === numero);
          return (
            <LinhaSerie
              key={`${numero}-${serie?.id ?? "nova"}-${serie?.atualizado_em ?? ""}`}
              numero={numero}
              serie={serie}
              alvo={item.alvo_reps}
              cargaSugerida={cargaSugerida}
              outroExercicio={serie && serie.exercicio_id !== atual ? nome(serie.exercicio_id) : undefined}
              aoGravar={(carga_kg, repeticoes) =>
                gravarSerie({
                  id: serie?.id,
                  sessao_id: sessao.id,
                  exercicio_id: serie?.exercicio_id ?? atual,
                  ficha_exercicio_id: item.id,
                  numero,
                  carga_kg,
                  repeticoes,
                })
              }
              aoApagar={serie ? () => apagarSerie(serie) : undefined}
            />
          );
        })}
        <button type="button" className="text-sm text-slate-400" onClick={() => setExtras((n) => n + 1)}>
          + série extra
        </button>
      </div>
      <p className="text-xs text-slate-500">Mesmo peso em todas as séries, parando a 1–2 reps da falha. É normal as reps caírem.</p>
      {exercicio && <Demonstracao exercicio={exercicio} />}
    </Cartao>
  );
}

export function Treino({ sessaoId }: { sessaoId: string }) {
  const sessao = useLiveQuery(() => db.sessoes.get(sessaoId), [sessaoId]);
  const ficha = useLiveQuery(() => (sessao?.ficha_id ? db.fichas.get(sessao.ficha_id) : undefined), [sessao?.ficha_id]);
  const itens = useLiveQuery(
    () => (sessao?.ficha_id ? db.ficha_exercicios.where("ficha_id").equals(sessao.ficha_id).toArray() : []),
    [sessao?.ficha_id],
  );
  const exercicios = useLiveQuery(() => db.exercicios.toArray(), []);
  const series = useLiveQuery(() => db.series.toArray(), []);
  const sessoes = useLiveQuery(() => db.sessoes.toArray(), []);

  if (sessao === undefined || !itens || !exercicios || !series || !sessoes) return null;
  if (sessao.excluido) {
    return (
      <div>
        <Titulo voltar="#/">Treino descartado</Titulo>
      </div>
    );
  }

  const porId = new Map(exercicios.map((e) => [e.id, e]));
  const terminado = sessao.finalizada_em !== null;

  return (
    <div className="space-y-3 pb-4">
      <Titulo voltar="#/">{ficha?.nome ?? "Treino"}</Titulo>
      {terminado && <Aviso tipo="info">Treino terminado em {formatarData(sessao.finalizada_em!)}. Dá para corrigir as séries.</Aviso>}

      {blocos(itens).map((bloco) =>
        bloco.length === 1 ? (
          <ItemTreino key={bloco[0]!.id} item={bloco[0]!} sessao={sessao} exercicios={porId} todasSeries={series} sessoes={sessoes} />
        ) : (
          <section key={bloco[0]!.id} className="space-y-2 rounded-2xl border border-sky-800 p-2">
            <p className="px-2 pt-1 text-sm text-sky-300">
              <strong>Bi-set:</strong> faça uma série de cada, em sequência, e descanse só depois do par.
              {new Set(bloco.map((i) => i.series)).size > 1 && " As voltas extras são só de quem tem mais séries."}
            </p>
            {bloco.map((item) => (
              <ItemTreino key={item.id} item={item} sessao={sessao} exercicios={porId} todasSeries={series} sessoes={sessoes} />
            ))}
          </section>
        ),
      )}

      {!terminado && (
        <div className="space-y-2 pt-2">
          <Botao variante="principal" className="w-full py-4 text-lg" onClick={() => terminarTreino(sessao)}>
            Terminar treino
          </Botao>
          <Botao
            variante="fantasma"
            className="w-full text-rose-400"
            onClick={() => confirm("Descartar este treino e as séries dele?") && cancelarTreino(sessao)}
          >
            Descartar treino
          </Botao>
        </div>
      )}
    </div>
  );
}
