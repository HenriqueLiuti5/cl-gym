import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

import { Demonstracao } from "../componentes/Demonstracao";
import { Icone } from "../componentes/icones";
import { Aviso, BarraTopo, Botao, Confirmar, Etiqueta } from "../componentes/ui";
import { db } from "../lib/db";
import { formatarData, formatarNumero, lerNumero } from "../lib/formato";
import { avisoProgressao, blocos, proximaOpcao, ultimaVez } from "../lib/regras";
import { apagarSerie, cancelarTreino, gravarSerie, terminarTreino } from "../lib/treino";
import type { Exercicio, FichaExercicio, Serie, Sessao } from "../lib/tipos";

/** Série · Anterior · kg · Reps · marcar. */
const COLUNAS = "grid grid-cols-[2rem_minmax(0,4.5rem)_minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-center gap-2";

const estiloNumero =
  "h-11 w-full min-w-0 rounded-lg border border-transparent px-1 text-center text-[17px] text-texto tabular-nums outline-none placeholder:text-texto-3/55 focus:border-acento";

const texto = (n: number) => String(n).replace(".", ",");

function LinhaSerie({
  numero,
  serie,
  anterior,
  cargaSugerida,
  alvo,
  outroExercicio,
  aoGravar,
  aoApagar,
}: {
  numero: number;
  serie?: Serie;
  anterior?: Serie;
  cargaSugerida: number | null;
  alvo: number;
  outroExercicio?: string;
  aoGravar: (carga: number, reps: number) => void;
  aoApagar?: () => void;
}) {
  // null = o campo ainda não foi mexido: mostra a carga sugerida (mesmo peso da série anterior).
  const [cargaDigitada, setCarga] = useState<string | null>(serie ? texto(serie.carga_kg) : null);
  const [reps, setReps] = useState(serie ? String(serie.repeticoes) : "");
  // A série mudou por fora (gravada aqui ou baixada de outro aparelho): os campos acompanham.
  // Ao desmarcar, os números ficam nos campos, para marcar de novo com um toque.
  const [vista, setVista] = useState(serie?.atualizado_em);
  if (serie && serie.atualizado_em !== vista) {
    setVista(serie.atualizado_em);
    setCarga(texto(serie.carga_kg));
    setReps(String(serie.repeticoes));
  }

  const carga = cargaDigitada ?? (cargaSugerida !== null ? texto(cargaSugerida) : "");
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
  const feita = serie !== undefined && serie.carga_kg === cargaNum && serie.repeticoes === repsNum;

  let estiloMarca = "border-2 border-borda text-texto-3";
  if (feita) estiloMarca = "bg-sucesso-forte text-white";
  else if (serie && valido) estiloMarca = "bg-acento-forte text-white"; // gravada e alterada: grava de novo
  else if (valido) estiloMarca = "border-2 border-acento text-acento";

  return (
    <div className={`-mx-2 rounded-lg px-2 py-1 ${feita ? "bg-sucesso-suave" : ""}`}>
      <div className={COLUNAS}>
        <span className={`text-center text-[15px] font-semibold tabular-nums ${feita ? "text-sucesso" : "text-texto-2"}`}>{numero}</span>
        <span className="truncate text-[14px] text-texto-3 tabular-nums">
          {anterior ? `${formatarNumero(anterior.carga_kg, 2)} × ${anterior.repeticoes}` : "—"}
        </span>
        <input
          className={`${estiloNumero} ${feita ? "bg-superficie font-semibold" : "bg-campo"}`}
          inputMode="decimal"
          aria-label={`Carga da série ${numero} (kg)`}
          placeholder="kg"
          value={carga}
          onChange={(e) => setCarga(e.target.value)}
        />
        <input
          className={`${estiloNumero} ${feita ? "bg-superficie font-semibold" : "bg-campo"}`}
          inputMode="numeric"
          aria-label={`Repetições da série ${numero}`}
          placeholder={String(alvo)}
          value={reps}
          onChange={(e) => setReps(e.target.value)}
        />
        <button
          type="button"
          className={`grid h-11 w-11 place-items-center rounded-lg disabled:opacity-60 ${estiloMarca}`}
          aria-label={feita ? `Desmarcar a série ${numero}` : `Marcar a série ${numero} como feita`}
          aria-pressed={feita}
          disabled={!feita && !valido}
          onClick={() => (feita ? aoApagar?.() : aoGravar(cargaNum!, repsNum!))}
        >
          <Icone nome="check" className="h-5.5 w-5.5" strokeWidth={2.25} />
        </button>
      </div>
      {outroExercicio && <p className="mt-1 pl-10 text-[13px] text-texto-3">Feita no {outroExercicio}</p>}
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

  return (
    <div className="space-y-3 p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] leading-snug font-semibold">{nome(atual)}</h2>
            {atual !== item.exercicio_id && <p className="text-[13px] text-texto-3">No lugar de {nome(item.exercicio_id)}</p>}
          </div>
          {item.alternativas.length > 0 && (
            <Botao tamanho="pequeno" className="-mt-0.5 shrink-0" onClick={() => setEscolha(proximaOpcao(item, atual))}>
              <Icone nome="trocar" className="h-4 w-4" />
              {atual === item.exercicio_id ? "Plano B" : "Trocar"}
            </Botao>
          )}
        </div>
        <p className="mt-0.5 text-[15px] text-texto-2">
          {item.series} {item.series === 1 ? "série" : "séries"} · alvo {item.alvo_reps} reps
          {ultima && ` · última vez ${formatarData(ultima.sessao.iniciada_em)}`}
        </p>
      </div>

      {item.aquecimento && (
        <p className="text-[14px] leading-snug text-texto-2">
          <Etiqueta tom="aviso">Aquecimento</Etiqueta> Antes, 1×10 leve (uns 50% do peso), sem descanso. Não conta como série.
        </p>
      )}
      {item.observacao && atual === item.exercicio_id && <p className="text-[14px] leading-snug text-texto-2">{item.observacao}</p>}
      {aviso?.sobe && (
        <Aviso tipo="bom" icone="subir" titulo="Sobe o peso.">
          Na última vez, a 1ª série passou 2 reps do alvo.
        </Aviso>
      )}
      {aviso?.pesado && (
        <Aviso tipo="ruim" icone="descer" titulo="Pesado demais.">
          Alguma série ficou 2 ou mais reps abaixo do alvo (ou o descanso foi curto).
        </Aviso>
      )}

      <div className="space-y-1">
        <div className={`${COLUNAS} text-[12px] font-medium text-texto-3`}>
          <span className="text-center">Série</span>
          <span>Anterior</span>
          <span className="text-center">kg</span>
          <span className="text-center">Reps</span>
          <span />
        </div>
        {Array.from({ length: linhas }, (_, i) => {
          const numero = i + 1;
          const serie = doItem.find((s) => s.numero === numero);
          return (
            <LinhaSerie
              key={numero}
              numero={numero}
              serie={serie}
              anterior={ultima?.series.find((s) => s.numero === numero)}
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
      </div>
      {!ultima && (
        <p className="text-[13px] leading-snug text-texto-3">
          Primeira vez: ache um peso que dê {item.alvo_reps} reps parando a 1–2 da falha.
        </p>
      )}
      <div>
        <button
          type="button"
          className="-ml-1 flex h-10 items-center gap-1.5 rounded-lg px-1 text-[15px] font-medium text-acento active:bg-acento-suave"
          onClick={() => setExtras((n) => n + 1)}
        >
          <Icone nome="mais" className="h-4.5 w-4.5" />
          Série extra
        </button>
        {exercicio && <Demonstracao exercicio={exercicio} />}
      </div>
    </div>
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
  const [descartando, setDescartando] = useState(false);

  if (sessao === undefined || !itens || !exercicios || !series || !sessoes) return null;
  if (sessao.excluido) {
    return (
      <div>
        <BarraTopo voltar="#/" titulo="Treino descartado" />
        <p className="px-1 text-[15px] text-texto-2">Este treino foi descartado e as séries dele foram apagadas.</p>
      </div>
    );
  }

  const porId = new Map(exercicios.map((e) => [e.id, e]));
  const terminado = sessao.finalizada_em !== null;
  const lista = blocos(itens);
  const planejadas = lista.flat().reduce((soma, i) => soma + i.series, 0);
  const feitas = series.filter((s) => s.sessao_id === sessao.id && !s.excluido).length;

  return (
    <div>
      <BarraTopo
        voltar="#/"
        titulo={ficha?.nome ?? "Treino"}
        acao={
          planejadas > 0 ? (
            <span className="px-2 text-[15px] text-texto-2 tabular-nums" aria-label={`${feitas} de ${planejadas} séries feitas`}>
              {feitas}/{planejadas}
            </span>
          ) : undefined
        }
      />
      {terminado ? (
        <Aviso tipo="info">Treino terminado em {formatarData(sessao.finalizada_em!)}. Dá para corrigir as séries.</Aviso>
      ) : (
        <p className="px-1 text-[14px] leading-snug text-texto-2">
          Mesmo peso em todas as séries, parando a 1–2 reps da falha. É normal as reps caírem.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {lista.map((bloco) => (
          <section key={bloco[0]!.id} className="overflow-hidden rounded-xl bg-superficie">
            {bloco.length > 1 && (
              <div className="flex items-start gap-2 border-b border-linha px-4 py-2.5">
                <Etiqueta>Bi-set</Etiqueta>
                <p className="text-[13px] leading-snug text-texto-2">
                  Uma série de cada, em sequência. Descanse depois do par.
                  {new Set(bloco.map((i) => i.series)).size > 1 && " As voltas extras são só de quem tem mais séries."}
                </p>
              </div>
            )}
            <div className="lista">
              {bloco.map((item) => (
                <ItemTreino key={item.id} item={item} sessao={sessao} exercicios={porId} todasSeries={series} sessoes={sessoes} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {!terminado && (
        <div className="mt-6 space-y-2">
          <Botao variante="principal" className="w-full" onClick={() => void terminarTreino(sessao)}>
            Terminar treino
          </Botao>
          <Botao variante="perigoLeve" className="w-full" onClick={() => setDescartando(true)}>
            Descartar treino
          </Botao>
        </div>
      )}
      {descartando && (
        <Confirmar
          titulo="Descartar este treino?"
          mensagem="O treino e as séries dele são apagados. Não dá para desfazer."
          rotulo="Descartar"
          perigo
          confirmar={() => cancelarTreino(sessao)}
          fechar={() => setDescartando(false)}
        />
      )}
    </div>
  );
}
