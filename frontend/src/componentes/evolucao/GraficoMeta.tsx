// Gráfico de linha ou de barras com o alvo da meta.
//
// A meta ganha um lugar no fim do eixo ("Meta"), marcado por um alvo (círculo com um ponto; ao
// alcançar, círculo verde com um visto): na linha, um tracejado sai do último valor até o alvo,
// mostrando onde a pessoa tem que chegar; nas barras, uma linha tracejada na altura da meta
// atravessa o gráfico, e as barras que chegaram lá ficam cheias (as outras, apagadas).

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { escala } from "../../lib/estatisticas";
import { COR } from "./cores";

export interface PontoGrafico {
  /** Único por ponto (é o eixo X). */
  chave: string;
  /** Curto, para o eixo (12/11). */
  rotulo: string;
  /** Completo, para a dica (qua, 12/11/26). */
  rotuloLongo: string;
  valor: number | null;
  /** Série de fundo, apagada (ex.: o peso de cada dia atrás da média). */
  contexto?: number | null;
  /** Linha extra na dica (ex.: "8 repetições"). */
  extra?: string;
}

type Linha = PontoGrafico & { ponte: number | null };

const CHAVE_META = "__meta";

export interface MetaNoGrafico {
  valor: number;
  alcancada: boolean;
}

function Caixa({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg border border-linha bg-superficie px-3 py-2 shadow-lg">
      <p className="text-[13px] text-texto-2">{titulo}</p>
      {children}
    </div>
  );
}

/** O alvo da meta. Alcançada: círculo verde com um visto desenhado. */
function MarcaMeta({ cx, cy, alcancada }: { cx?: number; cy?: number; alcancada: boolean }) {
  if (cx === undefined || cy === undefined) return <g />;
  if (alcancada) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={8.5} fill={COR.alcancada} stroke={COR.superficie} strokeWidth={2} />
        <path d={`M${cx - 3.6} ${cy + 0.2}l2.4 2.4 4.8-5`} fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill={COR.superficie} stroke={COR.meta} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={3} fill={COR.meta} />
    </g>
  );
}

/** Rótulo em cima de uma bolinha, alinhado pela direita dela: perto da borda do gráfico não
 * corta, e o contorno escuro mantém o texto legível por cima das linhas. */
function RotuloPonto({ viewBox, texto }: { viewBox?: { x?: number; y?: number; width?: number }; texto: string }) {
  const { x = 0, y = 0, width = 0 } = viewBox ?? {};
  return (
    <text
      x={x + width}
      y={y - 7}
      textAnchor="end"
      fill={COR.texto}
      stroke={COR.superficie}
      strokeWidth={4}
      paintOrder="stroke"
      fontSize={12}
      fontWeight={600}
    >
      {texto}
    </text>
  );
}

function Valor({ cor, valor, nome, tracejado = false }: { cor: string; valor: string; nome: string; tracejado?: boolean }) {
  return (
    <p className="flex items-center gap-2 text-[15px]">
      <span className={`w-3 ${tracejado ? "border-t-2 border-dashed" : "h-0.5 rounded"}`} style={tracejado ? { borderColor: cor } : { background: cor }} aria-hidden />
      <strong className="font-semibold tabular-nums">{valor}</strong>
      <span className="text-[13px] text-texto-2">{nome}</span>
    </p>
  );
}

export function GraficoMeta({
  tipo,
  pontos,
  cor,
  formatar,
  formatarEixo,
  nomeValor,
  nomeContexto = "",
  meta = null,
  destacar,
  divergente = false,
  descricao,
  altura = 210,
}: {
  tipo: "linha" | "barras";
  pontos: PontoGrafico[];
  cor: string;
  /** Valor com unidade, para a dica e os rótulos ("80 kg"). */
  formatar: (v: number) => string;
  /** Marcas do eixo Y (padrão: `formatar`). */
  formatarEixo?: (v: number) => string;
  nomeValor: string;
  nomeContexto?: string;
  meta?: MetaNoGrafico | null;
  /** Barras: quais estão "na meta" (as outras ficam apagadas). */
  destacar?: (valor: number) => boolean;
  /** Barras acima e abaixo do zero, com uma cor para cada lado. */
  divergente?: boolean;
  /** Frase para leitores de tela. */
  descricao: string;
  altura?: number;
}) {
  let ultimo = -1;
  pontos.forEach((p, i) => {
    if (p.valor !== null) ultimo = i;
  });
  const dados: Linha[] = pontos.map((p, i) => ({ ...p, ponte: meta && tipo === "linha" && i === ultimo ? p.valor : null }));
  if (meta) {
    dados.push({ chave: CHAVE_META, rotulo: "Meta", rotuloLongo: "Meta", valor: null, contexto: null, ponte: tipo === "linha" ? meta.valor : null });
  }
  const rotulos = new Map(dados.map((d) => [d.chave, d.rotulo]));

  // Eixo Y com marcas redondas, incluindo a meta. Barras partem do zero; a linha ganha uma folga.
  const valores = [...pontos.flatMap((p) => [p.valor, p.contexto ?? null]), meta?.valor ?? null].filter((v): v is number => v !== null);
  let eixoY: ReturnType<typeof escala>;
  if (divergente) {
    const maior = Math.max(0.2, ...valores.map(Math.abs));
    eixoY = escala(-maior, maior);
  } else if (tipo === "barras") {
    eixoY = escala(0, Math.max(1, ...valores) * 1.05);
  } else {
    const menor = Math.min(...valores);
    const maior = Math.max(...valores);
    const folga = Math.max((maior - menor) * 0.08, 0.5);
    eixoY = escala(Math.max(0, menor - folga), maior + folga);
  }

  const corMeta = meta?.alcancada ? COR.alcancada : COR.meta;
  const rotuloMeta = meta ? <RotuloPonto texto={formatar(meta.valor)} /> : undefined;
  const marcaMeta = meta ? (props: { cx?: number; cy?: number }) => <MarcaMeta cx={props.cx} cy={props.cy} alcancada={meta.alcancada} /> : undefined;
  const ultimoPonto = ultimo >= 0 ? pontos[ultimo]! : null;
  const eixos = (
    <>
      <CartesianGrid stroke={COR.grade} vertical={false} />
      <XAxis
        dataKey="chave"
        tickFormatter={(chave: string) => rotulos.get(chave) ?? ""}
        tick={{ fill: COR.eixo, fontSize: 12 }}
        tickLine={false}
        axisLine={{ stroke: COR.base }}
        interval="preserveStartEnd"
        minTickGap={14}
      />
      <YAxis
        domain={eixoY.dominio}
        ticks={eixoY.marcas}
        tickFormatter={formatarEixo ?? formatar}
        tick={{ fill: COR.eixo, fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        width={44}
      />
      <Tooltip
        cursor={tipo === "linha" ? { stroke: COR.base, strokeWidth: 1 } : { fill: COR.cursor, stroke: "none" }}
        content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const linha = payload[0]!.payload as Linha;
          if (linha.chave === CHAVE_META) {
            return meta ? (
              <Caixa titulo="Meta">
                <Valor cor={corMeta} valor={formatar(meta.valor)} nome={meta.alcancada ? "alcançada" : "onde você quer chegar"} tracejado />
              </Caixa>
            ) : null;
          }
          return (
            <Caixa titulo={linha.rotuloLongo}>
              {linha.valor !== null && <Valor cor={divergente ? (linha.valor < 0 ? COR.desceu : COR.subiu) : cor} valor={formatar(linha.valor)} nome={nomeValor} />}
              {linha.contexto != null && <Valor cor={COR.contexto} valor={formatar(linha.contexto)} nome={nomeContexto} />}
              {linha.valor === null && linha.contexto == null && <p className="text-[13px] text-texto-3">Nada lançado</p>}
              {linha.extra && <p className="text-[13px] text-texto-2">{linha.extra}</p>}
            </Caixa>
          );
        }}
      />
    </>
  );

  const margem = { top: 24, right: 26, left: 0, bottom: 0 };
  return (
    // data-sem-arrasto: arrastar o dedo no gráfico mostra os valores, não troca de tela.
    <div role="img" aria-label={descricao} className="-mx-1" data-sem-arrasto>
      <ResponsiveContainer width="100%" height={altura}>
        {tipo === "linha" ? (
          <LineChart data={dados} margin={margem}>
            {eixos}
            {nomeContexto && (
              <Line type="monotone" dataKey="contexto" stroke={COR.contexto} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: COR.contexto }} connectNulls isAnimationActive={false} />
            )}
            {meta && (
              <Line dataKey="ponte" stroke={corMeta} strokeOpacity={0.8} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} connectNulls isAnimationActive={false} />
            )}
            <Line
              type="monotone"
              dataKey="valor"
              stroke={cor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={pontos.length <= 12 ? { r: 4, fill: cor, stroke: COR.superficie, strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: cor, stroke: COR.superficie, strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
            {ultimoPonto && (
              <ReferenceDot
                x={ultimoPonto.chave}
                y={ultimoPonto.valor!}
                r={5}
                fill={cor}
                stroke={COR.superficie}
                strokeWidth={2}
                // Sem meta, o último valor ganha rótulo; com meta, o rótulo é dela (não se atropelam).
                label={meta ? undefined : <RotuloPonto texto={formatar(ultimoPonto.valor!)} />}
              />
            )}
            {meta && <ReferenceDot x={CHAVE_META} y={meta.valor} r={8} shape={marcaMeta} label={rotuloMeta} />}
          </LineChart>
        ) : (
          <BarChart data={dados} margin={margem} barCategoryGap={2}>
            {eixos}
            {divergente && <ReferenceLine y={0} stroke={COR.base} />}
            {meta && <ReferenceLine y={meta.valor} stroke={corMeta} strokeOpacity={0.7} strokeDasharray="4 4" />}
            {/* Sem "barra ativa": o destaque do toque é a faixa clara atrás da barra e a dica. */}
            <Bar dataKey="valor" radius={divergente ? 2 : [4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} activeBar={false}>
              {dados.map((d) => {
                const v = d.valor ?? 0;
                const fill = divergente ? (v < 0 ? COR.desceu : COR.subiu) : cor;
                const apagada = destacar && d.valor !== null && !destacar(d.valor);
                return <Cell key={d.chave} fill={fill} fillOpacity={apagada ? 0.38 : 1} />;
              })}
            </Bar>
            {meta && <ReferenceDot x={CHAVE_META} y={meta.valor} r={8} shape={marcaMeta} label={rotuloMeta} />}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
