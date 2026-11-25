// Peças da tela de Evolução (cartão, números, medidor, tabela, ranking, legenda).

import type { ReactNode } from "react";

import { Icone } from "../icones";

export function Bloco({ titulo, explicacao, children }: { titulo: string; explicacao?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl bg-superficie p-4">
      <header>
        <h2 className="text-[17px] leading-snug font-semibold">{titulo}</h2>
        {explicacao && <p className="mt-1 text-[13px] leading-snug text-texto-2">{explicacao}</p>}
      </header>
      {children}
    </section>
  );
}

/** Um número de destaque: rótulo, valor grande e um detalhe. */
export function Numero({
  rotulo,
  valor,
  detalhe,
  bom,
  dentro = false,
  compacto = false,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  /** Detalhe é uma notícia boa (ganha cor e seta, nunca só a cor). */
  bom?: boolean;
  /** Dentro de um cartão (fundo cinza). */
  dentro?: boolean;
  /** Três lado a lado: número menor, para caber "≈ 105 kg". */
  compacto?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-xl ${compacto ? "p-3" : "p-3.5"} ${dentro ? "bg-campo" : "bg-superficie"}`}>
      <p className="truncate text-[13px] text-texto-2">{rotulo}</p>
      <p className={`mt-1 truncate leading-tight font-semibold ${compacto ? "text-[18px]" : "text-[22px]"}`}>{valor}</p>
      {detalhe && <p className={`mt-1 text-[13px] leading-snug ${bom ? "font-medium text-sucesso" : "text-texto-3"}`}>{detalhe}</p>}
    </div>
  );
}

/** Barra de progresso: o trilho é a mesma cor, bem mais clara. */
export function Medidor({ fracao, cor, rotulo }: { fracao: number; cor: string; rotulo: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, fracao)) * 100);
  return (
    <div
      className="relative h-2 overflow-hidden rounded-full"
      role="progressbar"
      aria-label={rotulo}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="absolute inset-0 opacity-25" style={{ background: cor }} />
      <div className="relative h-full rounded-full" style={{ width: `${pct}%`, background: cor }} />
    </div>
  );
}

/** Os mesmos números do gráfico, em tabela (para quem não quer ou não consegue ler o gráfico). */
export function TabelaDados({ colunas, linhas }: { colunas: string[]; linhas: string[][] }) {
  if (!linhas.length) return null;
  return (
    <details className="group">
      <summary className="-ml-1 flex h-9 w-fit list-none items-center gap-1 rounded-lg px-1 text-[15px] font-medium text-acento select-none active:bg-acento-suave [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Ver os números</span>
        <span className="hidden group-open:inline">Esconder os números</span>
        <Icone nome="abaixo" className="h-4 w-4 group-open:rotate-180" />
      </summary>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-linha">
        <table className="w-full text-left text-[14px]">
          <thead className="sticky top-0 bg-superficie text-[13px] text-texto-2">
            <tr>
              {colunas.map((c) => (
                <th key={c} scope="col" className="px-3 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {linhas.map((linha, i) => (
              <tr key={i} className="border-t border-linha">
                {linha.map((celula, j) => (
                  <td key={j} className="px-3 py-2">
                    {celula}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Barras horizontais em ordem, do maior para o menor, com o valor na ponta. */
export function Ranking({ itens, cor }: { itens: { nome: string; valor: number; texto: string }[]; cor: string }) {
  const maior = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="space-y-2.5">
      {itens.map((item) => (
        <li key={item.nome} className="grid grid-cols-[minmax(0,8.5rem)_1fr] items-center gap-3 text-[15px]">
          <span className="truncate">{item.nome}</span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 rounded-r-[4px]" style={{ width: `${(item.valor / maior) * 72}%`, background: cor }} />
            <span className="shrink-0 text-[13px] text-texto-2 tabular-nums">{item.texto}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface Parte {
  nome: string;
  valor: number;
  cor: string;
  /** Cor do número dentro do bloco, pelo brilho da cor de fundo. */
  tinta: string;
}

/** Um todo dividido em partes (até 6), com a porcentagem dentro do bloco quando cabe. */
export function BarraSegmentada({ partes, rotulo }: { partes: Parte[]; rotulo: string }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (total <= 0) return null;
  const visiveis = partes.filter((p) => p.valor > 0);
  return (
    <div className="space-y-2.5">
      <div className="flex h-7 gap-0.5" role="img" aria-label={`${rotulo}: ${visiveis.map((p) => `${p.nome} ${Math.round((p.valor / total) * 100)}%`).join(", ")}`}>
        {visiveis.map((p) => {
          const pct = Math.round((p.valor / total) * 100);
          return (
            <div
              key={p.nome}
              className="flex items-center overflow-visible rounded-[4px] px-1.5 text-[13px] font-semibold tabular-nums"
              style={{ width: `${(p.valor / total) * 100}%`, background: p.cor, color: p.tinta }}
              title={`${p.nome}: ${pct}%`}
            >
              {pct >= 12 ? `${pct}%` : ""}
            </div>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-texto-2">
        {visiveis.map((p) => (
          <li key={p.nome} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.cor }} aria-hidden />
            {p.nome}
            {Math.round((p.valor / total) * 100) < 12 && <span className="text-texto-3">{Math.round((p.valor / total) * 100)}%</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Legenda de linhas/marcas, para gráficos com mais de uma série. */
export function Legenda({ itens }: { itens: { nome: string; cor: string; forma: "linha" | "ponto" | "barra" | "tracejado" | "alvo" }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-texto-2">
      {itens.map((i) => (
        <li key={i.nome} className="flex items-center gap-1.5">
          {i.forma === "linha" && <span className="h-0.5 w-4 rounded" style={{ background: i.cor }} aria-hidden />}
          {i.forma === "tracejado" && <span className="w-4 border-t-2 border-dashed" style={{ borderColor: i.cor }} aria-hidden />}
          {i.forma === "ponto" && <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.cor }} aria-hidden />}
          {i.forma === "barra" && <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.cor }} aria-hidden />}
          {i.forma === "alvo" && (
            <span className="grid h-3 w-3 place-items-center rounded-full border-2" style={{ borderColor: i.cor }} aria-hidden>
              <span className="h-1 w-1 rounded-full" style={{ background: i.cor }} />
            </span>
          )}
          {i.nome}
        </li>
      ))}
    </ul>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-superficie px-5 py-10 text-center text-[15px] leading-snug text-texto-2">{children}</p>;
}
