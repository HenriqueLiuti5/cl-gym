import { useLiveQuery } from "dexie-react-hooks";

import { BotaoComecar } from "../componentes/BotaoComecar";
import { Icone } from "../componentes/icones";
import { Botao, Cartao, Etiqueta, Grupo, Linha, Titulo } from "../componentes/ui";
import { db } from "../lib/db";
import { formatarData, formatarHora, haQuantoTempo } from "../lib/formato";
import { dataLocal, ordenarPorSugestao, treinosFeitos } from "../lib/regras";
import { ir } from "../lib/rota";
import type { FichaExercicio, Sessao } from "../lib/tipos";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Treino começado e não terminado: fica no topo até terminar ou descartar. */
function EmAndamento({ sessao, nome, planejadas }: { sessao: Sessao; nome: string; planejadas: number }) {
  const feitas = useLiveQuery(
    () => db.series.where("sessao_id").equals(sessao.id).filter((s) => !s.excluido).count(),
    [sessao.id],
  );
  const hoje = dataLocal(new Date(sessao.iniciada_em)) === dataLocal();
  const quando = hoje
    ? `Começou às ${formatarHora(sessao.iniciada_em)}`
    : `Começou em ${formatarData(sessao.iniciada_em)}, ${formatarHora(sessao.iniciada_em)}`;

  return (
    <Cartao>
      <Etiqueta tom="acento">Em andamento</Etiqueta>
      <p className="mt-2 text-[22px] leading-tight font-bold">{nome}</p>
      <p className="mt-1 text-[15px] text-texto-2">
        {quando}
        {feitas !== undefined && planejadas > 0 && ` · ${feitas} de ${plural(planejadas, "série", "séries")}`}
      </p>
      <Botao variante="principal" className="mt-4 w-full" onClick={() => ir(`/treino/${sessao.id}`)}>
        Continuar treino
      </Botao>
    </Cartao>
  );
}

export function Inicio() {
  const fichas = useLiveQuery(() => db.fichas.toArray(), []);
  const sessoes = useLiveQuery(() => db.sessoes.toArray(), []);
  const itens = useLiveQuery(() => db.ficha_exercicios.toArray(), []);
  if (!fichas || !sessoes || !itens) return null;

  const ordem = ordenarPorSugestao(fichas, sessoes);
  const emAndamento = sessoes
    .filter((s) => !s.excluido && !s.finalizada_em)
    .sort((a, b) => b.iniciada_em.localeCompare(a.iniciada_em))[0];
  const daFicha = (fichaId: string | null): FichaExercicio[] => itens.filter((i) => i.ficha_id === fichaId && !i.excluido);
  const resumo = (fichaId: string) => {
    const lista = daFicha(fichaId);
    return `${plural(lista.length, "exercício", "exercícios")} · ${plural(
      lista.reduce((soma, i) => soma + i.series, 0),
      "série",
      "séries",
    )}`;
  };
  const feitos = treinosFeitos(sessoes);
  const [sugestao, ...outras] = ordem;

  return (
    <div>
      <Titulo subtitulo={feitos ? plural(feitos, "treino feito", "treinos feitos") : "Nenhum treino feito ainda"}>Treinos</Titulo>

      <div className="space-y-6">
        {emAndamento && (
          <EmAndamento
            sessao={emAndamento}
            nome={fichas.find((f) => f.id === emAndamento.ficha_id)?.nome ?? "Treino avulso"}
            planejadas={daFicha(emAndamento.ficha_id).reduce((soma, i) => soma + i.series, 0)}
          />
        )}

        {!sugestao && (
          <Cartao>
            <p className="text-[15px] text-texto-2">Ainda não tem nenhuma ficha. Elas aparecem depois da primeira sincronização.</p>
          </Cartao>
        )}

        {sugestao && (
          <Grupo titulo="Sugestão de hoje" rodape="É a ficha que você fez há mais tempo. Dá para escolher qualquer outra.">
            <div className="p-4">
              <a href={`#/ficha/${sugestao.ficha.id}`} className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[22px] leading-tight font-bold">{sugestao.ficha.nome}</span>
                  <span className="mt-1 block text-[15px] text-texto-2">{resumo(sugestao.ficha.id)}</span>
                  <span className="block text-[15px] text-texto-2">
                    {sugestao.ultima ? `Última vez ${haQuantoTempo(sugestao.ultima)}` : "Nunca feito"}
                  </span>
                </span>
                <span className="mt-1 flex items-center gap-0.5 text-[15px] text-acento">
                  Ver ficha
                  <Icone nome="avancar" className="h-4 w-4" />
                </span>
              </a>
              <BotaoComecar fichaId={sugestao.ficha.id} variante={emAndamento ? "secundario" : "principal"} className="mt-4 w-full" />
            </div>
          </Grupo>
        )}

        {outras.length > 0 && (
          <Grupo titulo="Outras fichas">
            {outras.map(({ ficha, ultima }) => (
              <Linha
                key={ficha.id}
                href={`#/ficha/${ficha.id}`}
                titulo={ficha.nome}
                subtitulo={resumo(ficha.id)}
                direita={ultima ? haQuantoTempo(ultima) : "nunca feito"}
              />
            ))}
          </Grupo>
        )}
      </div>
    </div>
  );
}
