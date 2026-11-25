import { useState } from "react";

import { diasNaMeta, mediaPorSemana, mediaRecente, origemDasCalorias, porDia, type CampoDoDia } from "../../lib/estatisticas";
import { formatarData, formatarLitros, formatarNumero } from "../../lib/formato";
import { acharMeta, formatarMeta, naMeta, paraTela } from "../../lib/metas";
import type { TipoMeta } from "../../lib/tipos";
import { Segmentos } from "../ui";
import { BarraSegmentada, Bloco, Numero, TabelaDados, Vazio } from "./base";
import { COR } from "./cores";
import { dataCurta, dataLonga, type DadosEvolucao } from "./dados";
import { GraficoMeta } from "./GraficoMeta";
import { MetaDiaria } from "./Metas";

interface Nutriente {
  tipo: TipoMeta;
  campo: CampoDoDia;
  nome: string;
  cor: string;
  /** Valor guardado (ml na água) → texto. */
  formatar: (v: number) => string;
  sugestoes: number[];
}

const NUTRIENTES: Nutriente[] = [
  { tipo: "kcal", campo: "kcal", nome: "Calorias", cor: COR.kcal, formatar: (v) => `${formatarNumero(v, 0)} kcal`, sugestoes: [1800, 2200, 2600] },
  { tipo: "proteina", campo: "proteina_g", nome: "Proteína", cor: COR.proteina, formatar: (v) => `${formatarNumero(v, 0)} g`, sugestoes: [120, 150, 180] },
  { tipo: "carbo", campo: "carbo_g", nome: "Carboidrato", cor: COR.carbo, formatar: (v) => `${formatarNumero(v, 0)} g`, sugestoes: [180, 230, 280] },
  { tipo: "agua", campo: "agua_ml", nome: "Água", cor: COR.agua, formatar: formatarLitros, sugestoes: [2000, 2500, 3000] },
];

const MODOS = [
  { id: "dias", rotulo: "Últimos 14 dias" },
  { id: "semanas", rotulo: "Por semana" },
];

function CartaoNutriente({ d, n, modo, pesoAtual }: { d: DadosEvolucao; n: Nutriente; modo: string; pesoAtual: number | null }) {
  const meta = acharMeta(d.metas, n.tipo);
  const fator = n.tipo === "agua" ? 1000 : 1;
  const serie =
    modo === "dias"
      ? porDia(d.registros, n.campo, 14, d.hoje).map((p) => ({ chave: p.data, rotulo: formatarData(p.data, dataCurta), rotuloLongo: formatarData(p.data, dataLonga), valor: p.valor }))
      : mediaPorSemana(d.registros, n.campo, 12, d.hoje).map((s) => ({
          chave: s.semana,
          rotulo: formatarData(s.semana, dataCurta),
          rotuloLongo: `Semana de ${formatarData(s.semana, dataCurta)} (média de ${s.dias} ${s.dias === 1 ? "dia" : "dias"})`,
          valor: s.valor,
        }));
  const media7 = mediaRecente(d.registros, n.campo, 7, d.hoje);
  const mes = meta ? diasNaMeta(d.registros, n.campo, 30, d.hoje, (v) => naMeta(n.tipo, v, meta.valor)) : null;
  const lancados = serie.filter((p) => p.valor !== null);
  const maior = lancados.reduce<(typeof lancados)[number] | null>((m, p) => (!m || p.valor! > m.valor! ? p : m), null);

  let extra: string | null = null;
  if ((n.tipo === "proteina" || n.tipo === "carbo") && media7 !== null && pesoAtual) {
    extra = `Por kg de peso: ${formatarNumero(media7 / pesoAtual)} g/kg (média de 7 dias).`;
  } else if (n.tipo === "agua" && media7 !== null) {
    extra = `Uns ${formatarNumero(Math.round(media7 / 250), 0)} copos de 250 ml por dia, na média da semana.`;
  } else if (n.tipo === "kcal" && maior) {
    extra = `Maior ${modo === "dias" ? "dia" : "semana"} no gráfico: ${n.formatar(maior.valor!)} (${maior.rotuloLongo.toLowerCase()}).`;
  }

  return (
    <Bloco
      titulo={n.nome}
      explicacao={modo === "dias" ? "Total de cada dia; dia sem barra é dia sem lançamento." : "Média dos dias lançados em cada semana (segunda a domingo)."}
    >
      {lancados.length === 0 ? (
        <p className="py-4 text-center text-[15px] text-texto-3">Nada lançado {modo === "dias" ? "nos últimos 14 dias" : "nas últimas 12 semanas"}.</p>
      ) : (
        <GraficoMeta
          tipo="barras"
          pontos={serie.map((p) => ({ ...p, valor: p.valor === null ? null : p.valor / fator }))}
          cor={n.cor}
          formatar={(v) => n.formatar(v * fator)}
          formatarEixo={(v) => formatarNumero(v, fator > 1 ? 1 : 0)}
          nomeValor={modo === "dias" ? "no dia" : "média da semana"}
          meta={meta ? { valor: paraTela(n.tipo, meta.valor), alcancada: false } : null}
          destacar={meta ? (v) => naMeta(n.tipo, v * fator, meta.valor) : undefined}
          descricao={`${n.nome} ${modo === "dias" ? "por dia nos últimos 14 dias" : "por semana"}${media7 !== null ? `, média dos últimos 7 dias de ${n.formatar(media7)}` : ""}.`}
          altura={180}
        />
      )}
      <MetaDiaria
        tipo={n.tipo}
        meta={meta}
        resumo={mes && mes.lancados ? `${mes.na} de ${mes.lancados} dias lançados na meta (últimos 30 dias)` : undefined}
        editar={() =>
          d.editarMeta({
            tipo: n.tipo,
            exercicioId: null,
            titulo: `Meta de ${n.nome.toLowerCase()}`,
            meta,
            atual: null,
            contexto: media7 !== null ? `Na média dos últimos 7 dias: ${n.formatar(media7)} por dia.` : undefined,
            sugestoes: n.sugestoes,
          })
        }
      />
      {extra && <p className="text-[13px] leading-snug text-texto-2">{extra}</p>}
      <TabelaDados colunas={[modo === "dias" ? "Dia" : "Semana", n.nome]} linhas={[...lancados].reverse().map((p) => [p.rotuloLongo, n.formatar(p.valor!)])} />
    </Bloco>
  );
}

export function AbaNutricao({ d }: { d: DadosEvolucao }) {
  const [modo, setModo] = useState("dias");
  const temAlgo = d.registros.some((r) => !r.excluido && (r.kcal !== null || r.proteina_g !== null || r.carbo_g != null || r.agua_ml != null));
  if (!temAlgo) return <Vazio>Lance calorias, proteína, carboidrato ou água na aba Dia para ver os gráficos aqui.</Vazio>;
  const pesoAtual = d.pesos[d.pesos.length - 1]?.media7 ?? null;
  const origem = origemDasCalorias(d.registros, 7, d.hoje);

  return (
    <div className="space-y-4">
      <Segmentos opcoes={MODOS} escolhido={modo} escolher={setModo} rotulo="Como ver os gráficos" />
      <section>
        <h2 className="mb-1.5 px-4 text-[13px] font-semibold text-texto-2">Média dos últimos 7 dias</h2>
        <div className="grid grid-cols-2 gap-3">
          {NUTRIENTES.map((n) => {
            const media = mediaRecente(d.registros, n.campo, 7, d.hoje);
            const meta = acharMeta(d.metas, n.tipo);
            return (
              <Numero
                key={n.tipo}
                rotulo={n.nome}
                valor={media === null ? "—" : n.formatar(media)}
                detalhe={media !== null && meta ? `${formatarNumero((media / meta.valor) * 100, 0)}% da meta de ${formatarMeta(n.tipo, meta.valor)}` : meta ? "nada lançado na semana" : "sem meta"}
                bom={media !== null && !!meta && naMeta(n.tipo, media, meta.valor)}
              />
            );
          })}
        </div>
      </section>

      {NUTRIENTES.map((n) => (
        <CartaoNutriente key={n.tipo} d={d} n={n} modo={modo} pesoAtual={pesoAtual} />
      ))}

      {origem && (
        <Bloco
          titulo="De onde vêm suas calorias"
          explicacao={`Média dos últimos 7 dias com calorias, proteína e carboidrato lançados (${origem.dias} ${origem.dias === 1 ? "dia" : "dias"}).`}
        >
          <BarraSegmentada
            rotulo="Origem das calorias"
            partes={[
              { nome: "Proteína", valor: origem.proteina, cor: COR.proteina, tinta: "#ffffff" },
              { nome: "Carboidrato", valor: origem.carbo, cor: COR.carbo, tinta: "#0b0b0b" },
              { nome: "Gordura e o resto", valor: origem.resto, cor: COR.contexto, tinta: "var(--color-texto)" },
            ]}
          />
          <p className="text-[13px] leading-snug text-texto-2">
            Proteína e carboidrato têm 4 kcal por grama: {formatarNumero(origem.proteina, 0)} e {formatarNumero(origem.carbo, 0)} kcal das{" "}
            {formatarNumero(origem.kcal, 0)} do dia. O resto vem da gordura (e de bebida alcoólica, se tiver).
          </p>
        </Bloco>
      )}
    </div>
  );
}
