import { useState } from "react";

import { extremosDoPeso, imc, previsaoDaMeta, ritmoDoPeso, variacaoPorSemana } from "../../lib/estatisticas";
import { formatarData, formatarNumero, formatarVariacao } from "../../lib/formato";
import { acharMeta, situacaoDestino } from "../../lib/metas";
import { somarDias } from "../../lib/regras";
import { Segmentos } from "../ui";
import { Bloco, Legenda, Numero, TabelaDados, Vazio } from "./base";
import { COR } from "./cores";
import { dataCurta, dataLonga, type DadosEvolucao } from "./dados";
import { GraficoMeta } from "./GraficoMeta";
import { MetaDestino } from "./Metas";

const kg = (v: number) => `${formatarNumero(v)} kg`;
const meioQuilo = (v: number) => Math.round(v * 2) / 2;

const PERIODOS = [
  { id: "30", rotulo: "1 mês", dias: 30 },
  { id: "90", rotulo: "3 meses", dias: 90 },
  { id: "tudo", rotulo: "Tudo", dias: 0 },
];

export function AbaCorpo({ d }: { d: DadosEvolucao }) {
  const [periodo, setPeriodo] = useState("90");
  if (!d.pesos.length) return <Vazio>Lance o peso em jejum na aba Dia para ver a evolução do corpo aqui.</Vazio>;

  const ultimo = d.pesos[d.pesos.length - 1]!;
  const atual = ultimo.media7;
  const primeiro = d.pesos[0]!;
  const ritmo = ritmoDoPeso(d.pesos, d.hoje);
  const meta = acharMeta(d.metas, "peso");
  const situacao = meta ? situacaoDestino(meta, d.pesos.map((p) => ({ t: p.t, valor: p.media7 })), atual) : null;
  const previsao = meta && situacao?.alcancadaEm === null ? previsaoDaMeta(atual, meta.valor, ritmo, d.hoje) : null;
  const corpo = d.usuario.altura_cm ? imc(atual, d.usuario.altura_cm) : null;
  const variacao = atual - primeiro.peso;
  const sentido = situacao?.sentido ?? -1;

  const dias = PERIODOS.find((p) => p.id === periodo)!.dias;
  const desde = dias ? somarDias(d.hoje, -dias + 1) : "";
  const visiveis = d.pesos.filter((p) => p.data >= desde);
  const semanas = variacaoPorSemana(d.pesos).filter((s) => s.semana >= (desde ? somarDias(desde, -6) : ""));
  const extremos = extremosDoPeso(d.pesos);
  const descendo = semanas.filter((s) => s.variacao < 0).length;

  return (
    <div className="space-y-4">
      <Segmentos opcoes={PERIODOS} escolhido={periodo} escolher={setPeriodo} rotulo="Período dos gráficos" />

      <div className="grid grid-cols-2 gap-3">
        <Numero rotulo="Peso agora" valor={kg(atual)} detalhe="média dos últimos 7 dias" />
        <Numero
          rotulo="Desde o começo"
          valor={formatarVariacao(variacao, "kg")}
          detalhe={`desde ${formatarData(primeiro.data, dataCurta)}`}
          bom={Math.sign(variacao) === sentido && Math.abs(variacao) >= 0.1}
        />
        <Numero
          rotulo="Ritmo"
          valor={ritmo === null ? "—" : formatarVariacao(ritmo, "kg", 2)}
          detalhe={ritmo === null ? "pese mais vezes para calcular" : "por semana, nas últimas 4"}
        />
        <Numero rotulo="IMC" valor={corpo ? formatarNumero(corpo.valor) : "—"} detalhe={corpo ? corpo.faixa : "coloque a altura na Conta"} />
      </div>

      <Bloco titulo="Peso" explicacao="A linha forte é a média dos últimos 7 dias. O peso de cada dia sobe e desce com água e sal; a média mostra para onde você está indo.">
        <Legenda
          itens={[
            { nome: "Média de 7 dias", cor: COR.peso, forma: "linha" },
            { nome: "Peso do dia", cor: COR.contexto, forma: "linha" },
            ...(meta ? [{ nome: "Meta", cor: COR.meta, forma: "alvo" as const }] : []),
          ]}
        />
        <GraficoMeta
          tipo="linha"
          pontos={visiveis.map((p) => ({
            chave: p.data,
            rotulo: formatarData(p.data, dataCurta),
            rotuloLongo: formatarData(p.data, dataLonga),
            valor: p.media7,
            contexto: p.peso,
          }))}
          cor={COR.peso}
          formatar={kg}
          formatarEixo={(v) => formatarNumero(v, 1)}
          nomeValor="média de 7 dias"
          nomeContexto="peso do dia"
          meta={meta && situacao ? { valor: meta.valor, alcancada: situacao.alcancadaEm !== null } : null}
          descricao={`Peso pela média de 7 dias, agora em ${kg(atual)}${meta ? `, meta de ${kg(meta.valor)}` : ""}.`}
          altura={230}
        />
        <MetaDestino
          situacao={situacao}
          cor={COR.peso}
          formatar={kg}
          previsao={previsao?.data}
          editar={() =>
            d.editarMeta({
              tipo: "peso",
              exercicioId: null,
              titulo: "Meta de peso",
              meta,
              atual,
              contexto: `Agora a média de 7 dias está em ${kg(atual)}. A meta vale pela média, não pelo peso de um dia só.`,
              sugestoes: [meioQuilo(atual - 2), meioQuilo(atual - 5), meioQuilo(atual + 2)],
            })
          }
        />
        <TabelaDados
          colunas={["Dia", "Peso", "Média 7 dias"]}
          linhas={[...visiveis].reverse().map((p) => [formatarData(p.data, dataLonga), kg(p.peso), kg(p.media7)])}
        />
      </Bloco>

      {semanas.length > 1 && (
        <Bloco titulo="Quanto mudou em cada semana" explicacao="A média de peso de cada semana comparada com a da semana anterior.">
          <Legenda
            itens={[
              { nome: "Desceu", cor: COR.desceu, forma: "barra" },
              { nome: "Subiu", cor: COR.subiu, forma: "barra" },
            ]}
          />
          <GraficoMeta
            tipo="barras"
            divergente
            pontos={semanas.map((s) => ({
              chave: s.semana,
              rotulo: formatarData(s.semana, dataCurta),
              rotuloLongo: `Semana de ${formatarData(s.semana, dataCurta)}`,
              valor: s.variacao,
            }))}
            cor={COR.desceu}
            formatar={(v) => formatarVariacao(v, "kg", 2)}
            formatarEixo={(v) => formatarNumero(v, 1)}
            nomeValor="na semana"
            descricao={`Variação do peso semana a semana: desceu em ${descendo} de ${semanas.length} semanas.`}
            altura={180}
          />
          <p className="text-[13px] leading-snug text-texto-2">
            Desceu em {descendo} de {semanas.length} semanas.
            {ritmo !== null && ` No último mês, ${ritmo <= 0 ? "caiu" : "subiu"} em média ${formatarNumero(Math.abs(ritmo), 2)} kg por semana.`}
          </p>
        </Bloco>
      )}

      <Bloco titulo="Seus números">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[15px]">
          <dt className="text-texto-2">Altura</dt>
          <dd className="text-right tabular-nums">{d.usuario.altura_cm ? `${formatarNumero(d.usuario.altura_cm / 100, 2)} m` : "—"}</dd>
          <dt className="text-texto-2">Idade</dt>
          <dd className="text-right tabular-nums">{d.usuario.idade ? `${d.usuario.idade} anos` : "—"}</dd>
          {extremos && (
            <>
              <dt className="text-texto-2">Menor peso</dt>
              <dd className="text-right tabular-nums">
                {kg(extremos.menor.peso)} <span className="text-[13px] text-texto-3">{formatarData(extremos.menor.data, dataCurta)}</span>
              </dd>
              <dt className="text-texto-2">Maior peso</dt>
              <dd className="text-right tabular-nums">
                {kg(extremos.maior.peso)} <span className="text-[13px] text-texto-3">{formatarData(extremos.maior.data, dataCurta)}</span>
              </dd>
            </>
          )}
          <dt className="text-texto-2">Pesagens lançadas</dt>
          <dd className="text-right tabular-nums">{formatarNumero(d.pesos.length, 0)}</dd>
        </dl>
        {corpo && (
          <p className="text-[13px] leading-snug text-texto-3">
            IMC = peso ÷ altura². Ele não separa músculo de gordura: quem treina costuma ter o IMC mais alto sem que isso seja gordura.
          </p>
        )}
      </Bloco>
    </div>
  );
}
