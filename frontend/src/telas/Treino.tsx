import { useLiveQuery } from "dexie-react-hooks";
import { useId, useState } from "react";

import { Demonstracao } from "../componentes/Demonstracao";
import { Icone } from "../componentes/icones";
import { TrocarExercicio } from "../componentes/TrocarExercicio";
import { Aviso, BarraTopo, Botao, Confirmar } from "../componentes/ui";
import { agora, db } from "../lib/db";
import { formatarData, formatarNumero, lerNumero } from "../lib/formato";
import { novoId } from "../lib/ids";
import { lerCampos, mudouPorFora, NUMERO_MAX, textoCarga } from "../lib/linhaSerie";
import { avisoProgressao, ultimaVez } from "../lib/regras";
import { opcoesDeTroca, podeTrocar } from "../lib/troca";
import { apagarSerie, cancelarTreino, gravarSerie, seriesAnotadas, terminarTreino } from "../lib/treino";
import type { Exercicio, FichaExercicio, Serie, Sessao } from "../lib/tipos";

/** Série · Anterior · kg · Reps · anotada. */
const COLUNAS = "grid grid-cols-[2rem_minmax(0,4.5rem)_minmax(0,1fr)_minmax(0,1fr)_1.5rem] items-center gap-2";

const estiloNumero =
  "h-11 w-full min-w-0 rounded-lg border bg-campo px-1 text-center text-[17px] text-texto tabular-nums outline-none placeholder:text-texto-3/55";
const borda = (erro: boolean) => (erro ? "border-perigo" : "border-transparent focus:border-acento");

/**
 * Uma série: grava sozinha quando kg e reps estão preenchidos e válidos, a cada mudança (sem botão
 * de confirmar). Apagar o kg ou as reps apaga a série ao sair do campo.
 */
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
  aoGravar: (id: string, carga: number, reps: number, quando: string) => void;
  aoApagar: (id: string, quando: string) => void;
}) {
  // Um id por linha, o mesmo em todas as gravações: duas teclas seguidas, antes de a série gravada
  // voltar do banco, regravam a mesma série em vez de criar duas com o mesmo número.
  const [idProprio] = useState(() => serie?.id ?? novoId());
  const id = serie?.id ?? idProprio;
  // null = o campo ainda não foi mexido: mostra a carga sugerida (mesmo peso da série anterior).
  const [cargaDigitada, setCarga] = useState<string | null>(serie ? textoCarga(serie.carga_kg) : null);
  const [reps, setReps] = useState(serie ? String(serie.repeticoes) : "");
  // A última gravação feita por esta linha: quando e se a série ficou existindo.
  const [propria, setPropria] = useState<{ em: string; existe: boolean } | null>(null);

  // A série voltou do banco. Eco de uma gravação desta linha não mexe nos campos (eles podem estar
  // à frente: a pessoa já digitou mais). Mudança de fora (outro aparelho) reescreve só o campo cujo
  // número é diferente, para não tirar a vírgula de "22," enquanto a pessoa digita.
  const [vista, setVista] = useState(serie?.atualizado_em);
  if (serie && serie.atualizado_em !== vista) {
    setVista(serie.atualizado_em);
    if (mudouPorFora(serie.atualizado_em, propria?.em ?? null)) {
      if (cargaDigitada === null || lerNumero(cargaDigitada) !== serie.carga_kg) setCarga(textoCarga(serie.carga_kg));
      if (lerNumero(reps) !== serie.repeticoes) setReps(String(serie.repeticoes));
    }
  }

  const carga = cargaDigitada ?? (cargaSugerida !== null ? textoCarga(cargaSugerida) : "");
  const campos = lerCampos(carga, reps);
  const existe = serie !== undefined || propria?.existe === true;
  const anotada = existe && campos.valores !== null;
  const idErro = useId();
  const erro = [campos.cargaInvalida && "Carga de 0 a 1000 kg.", campos.repsInvalida && "Reps: número inteiro de 0 a 1000."]
    .filter(Boolean)
    .join(" ");

  function gravarSeValer(novaCarga: string, novasReps: string) {
    const { valores } = lerCampos(novaCarga, novasReps);
    if (!valores) return;
    const quando = agora();
    setCarga(novaCarga); // a carga sugerida passa a ser a desta série
    setPropria({ em: quando, existe: true });
    aoGravar(id, valores.carga, valores.reps, quando);
  }

  // Só ao sair do campo: quem apaga para redigitar não apaga e recria a série.
  function sair() {
    if (!existe || (carga.trim() !== "" && reps.trim() !== "")) return;
    const quando = agora();
    setPropria({ em: quando, existe: false });
    aoApagar(id, quando);
  }

  return (
    <div className="py-1">
      <div className={COLUNAS}>
        <span className={`text-center text-[15px] font-semibold tabular-nums ${anotada ? "text-sucesso" : "text-texto-2"}`}>{numero}</span>
        <span className="truncate text-[14px] text-texto-3 tabular-nums">
          {anterior ? `${formatarNumero(anterior.carga_kg, 2)} × ${anterior.repeticoes}` : "—"}
        </span>
        <input
          className={`${estiloNumero} ${borda(campos.cargaInvalida)}`}
          inputMode="decimal"
          aria-label={`Carga da série ${numero} (kg)`}
          aria-invalid={campos.cargaInvalida}
          aria-describedby={campos.cargaInvalida ? idErro : undefined}
          placeholder="kg"
          value={carga}
          onChange={(e) => {
            setCarga(e.target.value);
            gravarSeValer(e.target.value, reps);
          }}
          onBlur={sair}
        />
        <input
          className={`${estiloNumero} ${borda(campos.repsInvalida)}`}
          inputMode="numeric"
          aria-label={`Repetições da série ${numero}`}
          aria-invalid={campos.repsInvalida}
          aria-describedby={campos.repsInvalida ? idErro : undefined}
          placeholder={String(alvo)}
          value={reps}
          onChange={(e) => {
            setReps(e.target.value);
            gravarSeValer(carga, e.target.value);
          }}
          onBlur={sair}
        />
        {anotada ? (
          <span role="img" aria-label={`Série ${numero} anotada`} className="grid place-items-center text-sucesso">
            <Icone nome="check" className="h-5.5 w-5.5" strokeWidth={2.5} />
          </span>
        ) : (
          <span />
        )}
      </div>
      {erro && (
        <p id={idErro} className="mt-1 flex items-center gap-1 pl-10 text-[13px] text-perigo">
          <Icone nome="alerta" className="h-4 w-4" />
          {erro}
        </p>
      )}
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
  const [trocando, setTrocando] = useState(false);
  const atual = escolha ?? doItem.at(-1)?.exercicio_id ?? item.exercicio_id;
  const exercicio = exercicios.get(atual);
  const nome = (id: string) => exercicios.get(id)?.nome ?? "Exercício";
  const opcoes = opcoesDeTroca(item, exercicios);

  const ultima = ultimaVez(atual, todasSeries, sessoes, sessao.id);
  const aviso = ultima ? avisoProgressao(item.alvo_reps, ultima.series) : null;
  const linhas = Math.min(NUMERO_MAX, Math.max(item.series + extras, ...doItem.map((s) => s.numero)));
  const ultimaCargaHoje = [...doItem].reverse().find((s) => s.exercicio_id === atual)?.carga_kg;
  const cargaSugerida = ultimaCargaHoje ?? ultima?.series[0]?.carga_kg ?? null;

  return (
    <section className="space-y-3 rounded-xl bg-superficie p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] leading-snug font-semibold">{nome(atual)}</h2>
            {atual !== item.exercicio_id && <p className="text-[13px] text-texto-3">No lugar de {nome(item.exercicio_id)}</p>}
          </div>
          {podeTrocar(opcoes, atual) && (
            // Toque de 44 px em volta do botão visível de 36 px.
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setTrocando(true)}
              className="group -my-1.5 -mr-1 flex h-11 shrink-0 items-center px-1"
            >
              <span className="flex h-9 items-center gap-1.5 rounded-lg bg-campo px-3 text-[15px] font-medium text-texto group-active:opacity-75">
                <Icone nome="trocar" className="h-4 w-4" />
                Trocar
              </span>
            </button>
          )}
        </div>
        <p className="mt-0.5 text-[15px] text-texto-2">
          {item.series} {item.series === 1 ? "série" : "séries"} · alvo {item.alvo_reps} reps
          {ultima && ` · última vez ${formatarData(ultima.sessao.iniciada_em)}`}
        </p>
      </div>

      {item.aquecimento && (
        <p className="text-[14px] leading-snug text-texto-2">
          <strong className="font-semibold text-texto">Aquecimento:</strong> antes, 1×10 leve (uns 50% do peso), sem descanso. Não conta como série.
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
              aoGravar={(id, carga_kg, repeticoes, atualizado_em) =>
                void gravarSerie({
                  id,
                  atualizado_em,
                  sessao_id: sessao.id,
                  exercicio_id: serie?.exercicio_id ?? atual,
                  ficha_exercicio_id: item.id,
                  numero,
                  carga_kg,
                  repeticoes,
                })
              }
              aoApagar={(id, quando) => void apagarSerie(id, quando)}
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
        {linhas < NUMERO_MAX && (
          <button
            type="button"
            className="-ml-1 flex h-11 items-center gap-1.5 rounded-lg px-1 text-[15px] font-medium text-acento active:bg-acento-suave"
            onClick={() => setExtras((n) => n + 1)}
          >
            <Icone nome="mais" className="h-4.5 w-4.5" />
            Série extra
          </button>
        )}
        {exercicio && <Demonstracao exercicio={exercicio} />}
      </div>

      {trocando && (
        <TrocarExercicio
          opcoes={opcoes}
          atual={atual}
          ultimaVezDe={(id) => ultimaVez(id, todasSeries, sessoes, sessao.id)}
          escolher={(id) => {
            setEscolha(id);
            setTrocando(false);
          }}
          fechar={() => setTrocando(false)}
        />
      )}
    </section>
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
  const [semSeries, setSemSeries] = useState(false);

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
  const lista = itens.filter((i) => !i.excluido).sort((a, b) => a.ordem - b.ordem);
  const planejadas = lista.reduce((soma, i) => soma + i.series, 0);
  const feitas = series.filter((s) => s.sessao_id === sessao.id && !s.excluido).length;

  const finalizar = async () => {
    // Sai do campo em edição antes de contar: um kg ou reps apagado apaga a série ao sair dele.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if ((await seriesAnotadas(sessao.id)) > 0) await terminarTreino(sessao);
    else setSemSeries(true);
  };

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
          Mesmo peso em todas as séries, parando a 1–2 reps da falha. É normal as reps caírem. A série fica anotada ao
          digitar as reps.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {lista.map((item) => (
          <ItemTreino key={item.id} item={item} sessao={sessao} exercicios={porId} todasSeries={series} sessoes={sessoes} />
        ))}
      </div>

      {!terminado && (
        <div className="mt-6 space-y-2">
          <Botao variante="principal" className="w-full" onClick={() => void finalizar()}>
            Finalizar treino
          </Botao>
          <Botao variante="perigoLeve" className="w-full" onClick={() => setDescartando(true)}>
            Descartar treino
          </Botao>
        </div>
      )}
      {semSeries && (
        <Confirmar
          titulo="Nenhuma série anotada"
          mensagem="Finalizar mesmo assim? O treino conta como feito. Para não contar, use Descartar treino."
          rotulo="Finalizar"
          confirmar={() => terminarTreino(sessao)}
          fechar={() => setSemSeries(false)}
        />
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
