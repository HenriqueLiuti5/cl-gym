import { useLiveQuery } from "dexie-react-hooks";

import { gravarMeta, lerMeta } from "../../lib/db";
import {
  calendario,
  maiorPausa,
  maiorSequenciaDeDias,
  recordes,
  resumoTreinos,
  sequenciaDeSemanas,
  seriesPorGrupo,
  treinosPorFicha,
  treinosPorSemana,
  type ResumoExercicio,
} from "../../lib/estatisticas";
import { formatarData, formatarDuracao, formatarNumero, formatarTonelada, formatarVariacao } from "../../lib/formato";
import { acharMeta, naMeta, situacaoDestino } from "../../lib/metas";
import { somarDias } from "../../lib/regras";
import { Bloco, Numero, Ranking, TabelaDados, Vazio } from "./base";
import { COR } from "./cores";
import { Calendario } from "./Calendario";
import { dataCurta, dataLonga, type DadosEvolucao } from "./dados";
import { GraficoMeta } from "./GraficoMeta";
import { MetaDestino, MetaDiaria } from "./Metas";
import { SeletorExercicio } from "./SeletorExercicio";

const kg = (v: number) => `${formatarNumero(v)} kg`;
const vezes = (n: number, um: string, varios: string) => `${formatarNumero(n, 0)} ${n === 1 ? um : varios}`;

function CargaPorExercicio({ d, resumo }: { d: DadosEvolucao; resumo: ResumoExercicio }) {
  const { exercicio, recorde, primeiro } = resumo;
  const meta = acharMeta(d.metas, "carga", exercicio.id);
  const situacao = meta ? situacaoDestino(meta, resumo.pontos, recorde.valor) : null;
  const ganho = recorde.valor - primeiro.valor;
  const ultima = resumo.ultima.series;

  return (
    <Bloco titulo="Carga por exercício" explicacao="A maior carga de cada treino. O alvo no fim do gráfico é a sua meta.">
      <SeletorExercicio resumos={d.resumos} escolhido={exercicio.id} metas={d.metas} escolher={(id) => void gravarMeta("evolucao_exercicio", id)} />
      <div className="grid grid-cols-3 gap-2">
        <Numero dentro compacto rotulo="Recorde" valor={kg(recorde.valor)} detalhe={formatarData(recorde.data, dataCurta)} />
        <Numero
          dentro
          compacto
          rotulo="Evolução"
          valor={formatarVariacao(ganho, "kg")}
          detalhe={primeiro.valor > 0 && ganho > 0 ? `↑ ${formatarNumero((ganho / primeiro.valor) * 100, 0)}%` : `em ${vezes(resumo.treinos, "treino", "treinos")}`}
          bom={ganho > 0}
        />
        <Numero dentro compacto rotulo="1RM" valor={`≈ ${formatarNumero(Math.round(resumo.e1rm.valor), 0)} kg`} detalhe="estimado" />
      </div>
      <GraficoMeta
        tipo="linha"
        pontos={resumo.pontos.map((p) => ({
          chave: String(p.t),
          rotulo: formatarData(p.data, dataCurta),
          rotuloLongo: formatarData(p.data, dataLonga),
          valor: p.valor,
          extra: `${vezes(p.reps, "repetição", "repetições")} na série mais pesada`,
        }))}
        cor={COR.treino}
        formatar={kg}
        formatarEixo={(v) => formatarNumero(v, 1)}
        nomeValor="maior carga"
        meta={meta && situacao ? { valor: meta.valor, alcancada: situacao.alcancadaEm !== null } : null}
        descricao={`Maior carga de cada treino em ${exercicio.nome}, de ${kg(primeiro.valor)} a ${kg(recorde.valor)}${meta ? `, meta de ${kg(meta.valor)}` : ""}.`}
      />
      <MetaDestino
        situacao={situacao}
        cor={COR.treino}
        formatar={kg}
        editar={() =>
          d.editarMeta({
            tipo: "carga",
            exercicioId: exercicio.id,
            titulo: `Meta: ${exercicio.nome}`,
            meta,
            atual: recorde.valor,
            contexto: `Seu recorde é ${kg(recorde.valor)} (${formatarData(recorde.data, dataCurta)}). Até onde quer chegar?`,
            sugestoes: [2.5, 5, 10].map((mais) => recorde.valor + mais),
          })
        }
      />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[15px]">
        <dt className="text-texto-2">Última vez</dt>
        <dd className="text-right tabular-nums">
          {kg(ultima[0]?.carga_kg ?? 0)} × {ultima.map((s) => s.repeticoes).join(" · ")}
          <span className="block text-[13px] text-texto-3">{formatarData(resumo.ultima.data, dataLonga)}</span>
        </dd>
        <dt className="text-texto-2">Treinos com ele</dt>
        <dd className="text-right tabular-nums">{formatarNumero(resumo.treinos, 0)}</dd>
        <dt className="text-texto-2">Séries feitas</dt>
        <dd className="text-right tabular-nums">{formatarNumero(resumo.series, 0)}</dd>
        <dt className="text-texto-2">Média de repetições</dt>
        <dd className="text-right tabular-nums">{formatarNumero(resumo.repsMedia)} por série</dd>
        <dt className="text-texto-2">Peso levantado nele</dt>
        <dd className="text-right tabular-nums">{formatarTonelada(resumo.volume)}</dd>
      </dl>
      <p className="text-[13px] leading-snug text-texto-3">
        1RM estimado pela melhor série ({kg(resumo.e1rm.carga)} × {resumo.e1rm.reps}, fórmula de Epley): quanto você levantaria uma vez só.
      </p>
      <TabelaDados
        colunas={["Treino", "Maior carga", "Reps"]}
        linhas={[...resumo.pontos].reverse().map((p) => [formatarData(p.data, dataLonga), kg(p.valor), String(p.reps)])}
      />
    </Bloco>
  );
}

export function AbaTreino({ d }: { d: DadosEvolucao }) {
  const salvo = useLiveQuery(() => lerMeta<string>("evolucao_exercicio"), []);
  if (!d.treinos.length) return <Vazio>Termine um treino para ver a evolução aqui.</Vazio>;

  const resumo = resumoTreinos(d.treinos);
  const semanas = treinosPorSemana(d.treinos, somarDias(d.hoje, -7 * 11), d.hoje);
  const todasAsSemanas = treinosPorSemana(d.treinos, d.treinos[0]!.data, d.hoje);
  const metaSemana = acharMeta(d.metas, "treinos_semana");
  const estaSemana = semanas[semanas.length - 1]!.total;
  const completas = todasAsSemanas.slice(0, -1).slice(-11);
  const mediaSemanal = completas.length ? completas.reduce((s, x) => s + x.total, 0) / completas.length : estaSemana;
  const sequencia = metaSemana ? sequenciaDeSemanas(todasAsSemanas, metaSemana.valor) : null;
  const semanasNaMeta = metaSemana ? semanas.slice(0, -1).filter((s) => s.total >= metaSemana.valor).length : 0;
  const escolhido = d.resumos.find((r) => r.exercicio.id === salvo) ?? d.resumos[0];
  const nomeDaFicha = (id: string | null) => d.fichas.find((f) => f.id === id)?.nome ?? "Treino avulso";
  const prs = recordes(d.resumos);
  const grupos = seriesPorGrupo(d.treinos, d.exercicios, somarDias(d.hoje, -29));
  const porFicha = treinosPorFicha(d.treinos, d.fichas);
  const pausa = maiorPausa(d.treinos);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Numero rotulo="Treinos feitos" valor={formatarNumero(resumo.total, 0)} detalhe={`desde ${formatarData(d.treinos[0]!.data, dataCurta)}`} />
        <Numero
          rotulo="Esta semana"
          valor={metaSemana ? `${estaSemana} de ${metaSemana.valor}` : vezes(estaSemana, "treino", "treinos")}
          detalhe={metaSemana ? (estaSemana >= metaSemana.valor ? "meta da semana batida" : `faltam ${metaSemana.valor - estaSemana}`) : "segunda a domingo"}
          bom={!!metaSemana && estaSemana >= metaSemana.valor}
        />
        <Numero rotulo="Tempo treinando" valor={formatarDuracao(resumo.minutos)} detalhe={resumo.mediaMinutos ? `média de ${formatarDuracao(resumo.mediaMinutos)}` : undefined} />
        <Numero rotulo="Peso levantado" valor={formatarTonelada(resumo.volume)} detalhe="carga × repetições" />
      </div>

      {escolhido && <CargaPorExercicio d={d} resumo={escolhido} />}

      <Bloco titulo="Treinos por semana" explicacao="Cada barra é uma semana, de segunda a domingo; a última é a atual.">
        <GraficoMeta
          tipo="barras"
          pontos={semanas.map((s, i) => ({
            chave: s.semana,
            rotulo: formatarData(s.semana, dataCurta),
            rotuloLongo: i === semanas.length - 1 ? `Esta semana (desde ${formatarData(s.semana, dataCurta)})` : `Semana de ${formatarData(s.semana, dataCurta)}`,
            valor: s.total,
          }))}
          cor={COR.treino}
          formatar={(v) => vezes(v, "treino", "treinos")}
          formatarEixo={(v) => formatarNumero(v, 0)}
          nomeValor="na semana"
          meta={metaSemana ? { valor: metaSemana.valor, alcancada: false } : null}
          destacar={metaSemana ? (v) => naMeta("treinos_semana", v, metaSemana.valor) : undefined}
          descricao={`Treinos por semana nas últimas 12 semanas, média de ${formatarNumero(mediaSemanal)} por semana.`}
          altura={190}
        />
        <MetaDiaria
          tipo="treinos_semana"
          meta={metaSemana}
          resumo={
            metaSemana && sequencia
              ? `${semanasNaMeta} das últimas 11 semanas na meta · sequência ${sequencia.atual > 0 ? `atual de ${vezes(sequencia.atual, "semana", "semanas")}` : "zerada"} · melhor: ${vezes(sequencia.melhor, "semana", "semanas")}`
              : undefined
          }
          editar={() =>
            d.editarMeta({
              tipo: "treinos_semana",
              exercicioId: null,
              titulo: "Meta de treinos por semana",
              meta: metaSemana,
              atual: null,
              contexto: `Nas últimas semanas, você fez em média ${formatarNumero(mediaSemanal)} treinos por semana.`,
              sugestoes: [3, 4, 5],
            })
          }
        />
        <p className="text-[13px] leading-snug text-texto-3">Média das últimas semanas completas: {formatarNumero(mediaSemanal)} treinos.</p>
        <TabelaDados colunas={["Semana", "Treinos"]} linhas={[...semanas].reverse().map((s) => [formatarData(s.semana, dataCurta), String(s.total)])} />
      </Bloco>

      <Bloco titulo="Constância" explicacao="Cada quadrado é um dia das últimas 16 semanas.">
        <Calendario grade={calendario(d.treinos, 16, d.hoje)} hoje={d.hoje} nomeDaFicha={nomeDaFicha} cor={COR.treino} />
        <div className="grid grid-cols-2 gap-2">
          <Numero dentro rotulo="Dias seguidos (recorde)" valor={vezes(maiorSequenciaDeDias(d.treinos.map((t) => t.data)), "dia", "dias")} />
          <Numero dentro rotulo="Maior pausa" valor={pausa ? vezes(pausa.dias, "dia", "dias") : "nenhuma"} detalhe={pausa ? `${formatarData(pausa.de, dataCurta)} a ${formatarData(pausa.ate, dataCurta)}` : undefined} />
        </div>
      </Bloco>

      {prs.length > 0 && (
        <Bloco titulo="Recordes recentes" explicacao="Quando a carga passou da maior que você já tinha feito naquele exercício.">
          <ul className="space-y-3">
            {prs.slice(0, 6).map((r) => (
              <li key={`${r.exercicio.id}-${r.data}`} className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">{r.exercicio.nome}</span>
                  <span className="block text-[13px] text-texto-3">
                    antes: {kg(r.anterior)} · {formatarData(r.data, dataLonga)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <strong className="block text-[15px] font-semibold tabular-nums">{kg(r.carga)}</strong>
                  <span className="block text-[13px] font-medium text-sucesso tabular-nums">↑ {formatarVariacao(r.carga - r.anterior, "kg")}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] leading-snug text-texto-3">
            {vezes(prs.length, "recorde", "recordes")} no total, {vezes(prs.filter((r) => r.data >= somarDias(d.hoje, -29)).length, "recorde", "recordes")} nos últimos 30 dias.
          </p>
        </Bloco>
      )}

      {grupos.length > 0 && (
        <Bloco titulo="Músculos mais treinados" explicacao="Séries feitas nos últimos 30 dias, por grupo muscular.">
          <Ranking cor={COR.treino} itens={grupos.map((g) => ({ nome: g.grupo, valor: g.series, texto: vezes(g.series, "série", "séries") }))} />
        </Bloco>
      )}

      {porFicha.length > 0 && (
        <Bloco titulo="Fichas" explicacao="Quantas vezes cada uma foi feita e quanto o treino costuma durar.">
          <Ranking
            cor={COR.treino}
            itens={porFicha.map((f) => ({
              nome: f.ficha.nome,
              valor: f.total,
              texto: `${f.total}×${f.mediaMinutos ? ` · ${formatarDuracao(f.mediaMinutos)}` : ""}`,
            }))}
          />
        </Bloco>
      )}
    </div>
  );
}
