import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

import { Icone, type NomeIcone } from "../componentes/icones";
import { ModelosProntos } from "../componentes/ModelosProntos";
import { Botao, Cartao, Etiqueta, Grupo, Linha, Titulo } from "../componentes/ui";
import { db, lerMeta } from "../lib/db";
import { formatarData, formatarHora, haQuantoTempo } from "../lib/formato";
import { listarTreinos, resumoDoTreino } from "../lib/modelos";
import { dataLocal, treinosFeitos } from "../lib/regras";
import { ir } from "../lib/rota";
import type { EstadoSync } from "../lib/sync";
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

/** Texto de uma linha de ação, com o ícone na frente (Criar treino, Usar um modelo pronto). */
function ComIcone({ icone, children }: { icone: NomeIcone; children: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <Icone nome={icone} className="h-5 w-5" />
      {children}
    </span>
  );
}

/** Conta sem nenhuma ficha (a conta nova começa vazia): montar o treino ou partir de um modelo. */
function SemTreinos({ abrirModelos }: { abrirModelos: () => void }) {
  return (
    <Cartao>
      <p className="text-[19px] leading-snug font-semibold">Monte o seu treino</p>
      <p className="mt-1 text-[15px] leading-snug text-texto-2">
        Escolha os exercícios do app ou comece de um modelo pronto e ajuste do seu jeito.
      </p>
      <Botao variante="principal" className="mt-4 w-full" onClick={() => ir("/editar/nova")}>
        <Icone nome="mais" className="h-5 w-5" />
        Criar treino
      </Botao>
      <Botao className="mt-2 w-full" onClick={abrirModelos}>
        Usar um modelo pronto
      </Botao>
    </Cartao>
  );
}

/**
 * Ainda não sincronizou neste aparelho (sem cursor): quem já tem conta e abre num celular novo
 * não deve ver o cartão de conta vazia enquanto os treinos dele não chegam.
 */
function Buscando({ estado }: { estado: EstadoSync | undefined }) {
  const texto =
    estado?.situacao === "offline"
      ? "Sem internet agora. Os seus treinos aparecem aqui quando a conexão voltar."
      : estado?.situacao === "erro"
        ? "Não deu para buscar os seus treinos agora. O app tenta de novo na próxima sincronização."
        : "Buscando seus treinos…";
  return (
    <Cartao>
      <p className="text-[15px] leading-snug text-texto-2">{texto}</p>
    </Cartao>
  );
}

export function Inicio() {
  const [modelosAbertos, setModelosAbertos] = useState(false);
  const fichas = useLiveQuery(() => db.fichas.toArray(), []);
  const sessoes = useLiveQuery(() => db.sessoes.toArray(), []);
  const itens = useLiveQuery(() => db.ficha_exercicios.toArray(), []);
  // Já baixou do servidor alguma vez neste aparelho? (o cursor só existe depois do primeiro download)
  const sync = useLiveQuery(
    async () => ({
      feita: (await lerMeta<number>("cursor")) !== undefined,
      estado: await lerMeta<EstadoSync>("estado_sync"),
    }),
    [],
  );
  if (!fichas || !sessoes || !itens || !sync) return null;

  const treinos = listarTreinos(fichas, sessoes);
  const emAndamento = sessoes
    .filter((s) => !s.excluido && !s.finalizada_em)
    .sort((a, b) => b.iniciada_em.localeCompare(a.iniciada_em))[0];
  const daFicha = (fichaId: string | null): FichaExercicio[] => itens.filter((i) => i.ficha_id === fichaId && !i.excluido);
  const feitos = treinosFeitos(sessoes);
  const abrirModelos = () => setModelosAbertos(true);
  const vazia = treinos.length === 0 && sync.feita;

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

        {vazia && <SemTreinos abrirModelos={abrirModelos} />}
        {treinos.length === 0 && !sync.feita && <Buscando estado={sync.estado} />}

        {treinos.length > 0 && (
          <Grupo titulo="Seus treinos">
            {treinos.map(({ ficha, ultima }) => (
              <Linha
                key={ficha.id}
                href={`#/ficha/${ficha.id}`}
                titulo={ficha.nome}
                subtitulo={resumoDoTreino(daFicha(ficha.id))}
                direita={ultima ? haQuantoTempo(ultima) : "nunca feito"}
              />
            ))}
          </Grupo>
        )}

        {/* Sempre à mão, também para quem já tem treinos (na conta vazia, os botões ficam no cartão). */}
        {!vazia && (
          <Grupo rodape="Monte um treino com os exercícios do app ou copie um modelo pronto para ajustar do seu jeito.">
            <Linha titulo={<ComIcone icone="mais">Criar treino</ComIcone>} tom="acento" href="#/editar/nova" seta={false} />
            <Linha titulo={<ComIcone icone="mais">Usar um modelo pronto</ComIcone>} tom="acento" onClick={abrirModelos} />
          </Grupo>
        )}
      </div>

      {modelosAbertos && <ModelosProntos fechar={() => setModelosAbertos(false)} />}
    </div>
  );
}
