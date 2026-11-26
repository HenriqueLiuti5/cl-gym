// Evolução: treino, corpo, alimentação e curiosidades, com as metas de cada gráfico.

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";

import { AbaCorpo } from "../componentes/evolucao/AbaCorpo";
import { AbaCuriosidades } from "../componentes/evolucao/AbaCuriosidades";
import { AbaNutricao } from "../componentes/evolucao/AbaNutricao";
import { AbaTreino } from "../componentes/evolucao/AbaTreino";
import type { DadosEvolucao } from "../componentes/evolucao/dados";
import { EditorMeta, Parabens, type PedidoDeMeta } from "../componentes/evolucao/Metas";
import { Segmentos, Titulo } from "../componentes/ui";
import { db } from "../lib/db";
import { exerciciosFeitos, montarTreinos, pontosDePeso } from "../lib/estatisticas";
import { acharMeta, chaveComemoracao, lerComemoradas, situacaoDestino, type SituacaoMeta } from "../lib/metas";
// As partes ficam em lib/navegacao.ts porque arrastar o dedo também passa por elas.
import { PARTES_EVOLUCAO as ABAS } from "../lib/navegacao";
import { dataLocal } from "../lib/regras";
import type { Usuario } from "../lib/tipos";

/** Metas de destino alcançadas e ainda não comemoradas neste aparelho (a primeira aparece). */
function comemoracoesPendentes(d: DadosEvolucao, comemoradas: string[]): { situacao: SituacaoMeta; onde: string }[] {
  const pendentes: { situacao: SituacaoMeta; onde: string }[] = [];
  const peso = acharMeta(d.metas, "peso");
  if (peso && d.pesos.length) {
    const situacao = situacaoDestino(peso, d.pesos.map((p) => ({ t: p.t, valor: p.media7 })), d.pesos[d.pesos.length - 1]!.media7);
    if (situacao.alcancadaEm !== null) pendentes.push({ situacao, onde: "de peso (pela média de 7 dias)" });
  }
  for (const r of d.resumos) {
    const meta = acharMeta(d.metas, "carga", r.exercicio.id);
    if (!meta) continue;
    const situacao = situacaoDestino(meta, r.pontos, r.recorde.valor);
    if (situacao.alcancadaEm !== null) pendentes.push({ situacao, onde: `no exercício ${r.exercicio.nome}` });
  }
  return pendentes.filter((p) => !comemoradas.includes(chaveComemoracao(p.situacao.meta)));
}

export function Graficos({ usuario, aba }: { usuario: Usuario; aba?: string }) {
  const exercicios = useLiveQuery(() => db.exercicios.toArray(), []);
  const fichas = useLiveQuery(() => db.fichas.toArray(), []);
  const itens = useLiveQuery(() => db.ficha_exercicios.toArray(), []);
  const sessoes = useLiveQuery(() => db.sessoes.toArray(), []);
  const series = useLiveQuery(() => db.series.toArray(), []);
  const registros = useLiveQuery(() => db.registros_diarios.toArray(), []);
  const metas = useLiveQuery(() => db.metas.toArray(), []);
  const comemoradas = useLiveQuery(lerComemoradas, []);
  const [pedido, setPedido] = useState<PedidoDeMeta | null>(null);
  // Fechadas nesta visita (evita reabrir enquanto a marca de "comemorada" é gravada).
  const [vistas, setVistas] = useState<string[]>([]);

  const treinos = useMemo(() => (sessoes && series ? montarTreinos(sessoes, series) : []), [sessoes, series]);
  const resumos = useMemo(() => (exercicios ? exerciciosFeitos(treinos, exercicios) : []), [treinos, exercicios]);
  const pesos = useMemo(() => (registros ? pontosDePeso(registros) : []), [registros]);

  if (!exercicios || !fichas || !itens || !sessoes || !series || !registros || !metas || !comemoradas) return null;

  const d: DadosEvolucao = {
    usuario,
    hoje: dataLocal(),
    exercicios,
    fichas,
    itens,
    registros,
    metas,
    treinos,
    resumos,
    pesos,
    editarMeta: setPedido,
  };
  const atual = ABAS.find((a) => a.id === aba)?.id ?? "treino";
  const parabens = comemoracoesPendentes(d, [...comemoradas, ...vistas])[0];

  return (
    <div>
      {/* data-fixo-na-troca: o título e os segmentos ficam parados ao trocar de parte (Palco.tsx). */}
      <div data-fixo-na-troca="titulo">
        <Titulo>Evolução</Titulo>
      </div>
      <nav data-fixo-na-troca="segmentos" className="sticky top-0 z-20 -mx-4 -mt-1 bg-fundo px-4 pt-1 pb-3" aria-label="Partes da evolução">
        <Segmentos opcoes={ABAS} escolhido={atual} link={(id) => `#/graficos/${id}`} rotulo="Partes da evolução" />
      </nav>

      {/* Só esta parte desliza ao trocar de parte; o título e os segmentos ficam (Palco.tsx). */}
      <div data-pagina>
        {atual === "treino" && <AbaTreino d={d} />}
        {atual === "corpo" && <AbaCorpo d={d} />}
        {atual === "nutricao" && <AbaNutricao d={d} />}
        {atual === "curiosidades" && <AbaCuriosidades d={d} />}
      </div>

      {pedido && <EditorMeta usuarioId={usuario.id} pedido={pedido} fechar={() => setPedido(null)} />}
      {!pedido && parabens && (
        <Parabens
          key={chaveComemoracao(parabens.situacao.meta)}
          usuarioId={usuario.id}
          situacao={parabens.situacao}
          onde={parabens.onde}
          fechar={() => setVistas((v) => [...v, chaveComemoracao(parabens.situacao.meta)])}
        />
      )}
    </div>
  );
}
