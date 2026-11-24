import { useLiveQuery } from "dexie-react-hooks";

import { Botao, Cartao } from "../componentes/ui";
import { formatarData, haQuantoTempo } from "../lib/formato";
import { db } from "../lib/db";
import { ordenarPorSugestao, treinosFeitos } from "../lib/regras";
import { ir } from "../lib/rota";
import { comecarTreino } from "../lib/treino";
import type { Usuario } from "../lib/tipos";

export function Inicio({ usuario }: { usuario: Usuario }) {
  const fichas = useLiveQuery(() => db.fichas.toArray(), []);
  const sessoes = useLiveQuery(() => db.sessoes.toArray(), []);
  const itens = useLiveQuery(() => db.ficha_exercicios.toArray(), []);
  if (!fichas || !sessoes || !itens) return null;

  const ordem = ordenarPorSugestao(fichas, sessoes);
  const emAndamento = sessoes
    .filter((s) => !s.excluido && !s.finalizada_em)
    .sort((a, b) => b.iniciada_em.localeCompare(a.iniciada_em))[0];
  const nomeFicha = (id: string | null) => fichas.find((f) => f.id === id)?.nome ?? "Treino avulso";
  const resumo = (fichaId: string) => {
    const daFicha = itens.filter((i) => i.ficha_id === fichaId && !i.excluido);
    const series = daFicha.reduce((soma, i) => soma + i.series, 0);
    return `${daFicha.length} exercícios · ${series} séries`;
  };

  async function comecar(fichaId: string) {
    if (emAndamento && !confirm("Você tem um treino em andamento. Começar outro mesmo assim?")) return;
    await comecarTreino(fichaId);
  }

  const primeiroNome = usuario.nome?.split(" ")[0];

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-slate-400">Olá{primeiroNome ? `, ${primeiroNome}` : ""}!</p>
          <h1 className="text-2xl font-bold">Qual o treino de hoje?</h1>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-emerald-400">{treinosFeitos(sessoes)}</p>
          <p className="text-xs text-slate-400">treinos feitos</p>
        </div>
      </header>

      {emAndamento && (
        <Cartao className="border border-emerald-700">
          <p className="text-sm text-slate-400">Em andamento desde {formatarData(emAndamento.iniciada_em, { hour: "2-digit", minute: "2-digit" })}</p>
          <p className="mb-3 text-lg font-semibold">{nomeFicha(emAndamento.ficha_id)}</p>
          <Botao variante="principal" className="w-full" onClick={() => ir(`/treino/${emAndamento.id}`)}>
            Continuar treino
          </Botao>
        </Cartao>
      )}

      {ordem.length === 0 && (
        <Cartao>
          <p className="text-slate-300">Ainda não tem nenhuma ficha. Elas aparecem depois da primeira sincronização.</p>
        </Cartao>
      )}

      {ordem.map(({ ficha, ultima }, i) => (
        <Cartao key={ficha.id} className={i === 0 ? "ring-2 ring-emerald-500" : ""}>
          {i === 0 && (
            <p className="mb-1 text-xs font-semibold tracking-wide text-emerald-400 uppercase">Sugestão de hoje</p>
          )}
          <button type="button" className="w-full text-left" onClick={() => ir(`/ficha/${ficha.id}`)}>
            <p className="text-xl font-semibold">{ficha.nome}</p>
            <p className="text-sm text-slate-400">
              {resumo(ficha.id)} · {ultima ? `feito ${haQuantoTempo(ultima)}` : "nunca feito"}
            </p>
          </button>
          <div className="mt-3 flex gap-2">
            <Botao variante={i === 0 ? "principal" : "secundario"} className="flex-1" onClick={() => comecar(ficha.id)}>
              Começar
            </Botao>
            <Botao variante="fantasma" onClick={() => ir(`/ficha/${ficha.id}`)}>
              Ver ficha
            </Botao>
          </div>
        </Cartao>
      ))}
    </div>
  );
}
