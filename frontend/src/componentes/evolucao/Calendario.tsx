// Constância: um quadrado por dia das últimas semanas (colunas de segunda a domingo).

import { useState } from "react";

import type { DiaCalendario } from "../../lib/estatisticas";
import { formatarData, formatarDuracao } from "../../lib/formato";
import { Legenda } from "./base";
import { COR } from "./cores";

const LETRAS = ["S", "T", "Q", "Q", "S", "S", "D"];

export function Calendario({ grade, hoje, nomeDaFicha, cor }: { grade: DiaCalendario[][]; hoje: string; nomeDaFicha: (id: string | null) => string; cor: string }) {
  const [escolhido, setEscolhido] = useState<DiaCalendario | null>(null);
  const colunas = { gridTemplateColumns: `repeat(${grade.length}, minmax(0, 1fr))` };
  // Nome do mês em cima da primeira semana de cada mês.
  const meses = grade.map((semana, i) => {
    const mes = semana[0]!.data.slice(0, 7);
    const anterior = i > 0 ? grade[i - 1]![0]!.data.slice(0, 7) : null;
    return mes !== anterior ? formatarData(semana[0]!.data, { month: "short" }).replace(".", "") : "";
  });

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <div className="grid grid-rows-[auto_repeat(7,minmax(0,1fr))] gap-1 text-[11px] leading-none text-texto-3" aria-hidden>
          <span className="h-3" />
          {LETRAS.map((l, i) => (
            <span key={i} className="flex items-center">
              {i % 2 === 0 ? l : ""}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="grid h-3 gap-1 text-[11px] leading-none text-texto-3" style={colunas} aria-hidden>
            {meses.map((m, i) => (
              <span key={i} className="overflow-visible whitespace-nowrap">
                {m}
              </span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-1" style={colunas}>
            {grade.flat().map((dia) => {
              const treinou = dia.treinos.length > 0;
              return (
                <button
                  key={dia.data}
                  type="button"
                  disabled={dia.futuro}
                  onClick={() => setEscolhido(dia)}
                  aria-label={`${formatarData(dia.data, { weekday: "long", day: "2-digit", month: "2-digit" })}: ${treinou ? "treinou" : "sem treino"}`}
                  className={`aspect-square rounded-[3px] ${dia.futuro ? "invisible" : ""} ${dia.data === hoje ? "ring-1 ring-texto-3" : ""} ${escolhido?.data === dia.data ? "ring-2 ring-texto" : ""}`}
                  style={{ background: treinou ? cor : COR.vazio }}
                />
              );
            })}
          </div>
        </div>
      </div>
      <Legenda
        itens={[
          { nome: "Treinou", cor, forma: "barra" },
          { nome: "Sem treino", cor: COR.vazio, forma: "barra" },
        ]}
      />
      <p className="min-h-5 text-[13px] leading-snug text-texto-2" aria-live="polite">
        {escolhido
          ? `${formatarData(escolhido.data, { weekday: "long", day: "2-digit", month: "2-digit" })}: ${
              escolhido.treinos.length
                ? escolhido.treinos.map((t) => `${nomeDaFicha(t.sessao.ficha_id)}${t.minutos ? ` (${formatarDuracao(t.minutos)})` : ""}`).join(", ")
                : "sem treino"
            }`
          : "Toque num dia para ver o treino."}
      </p>
    </div>
  );
}
