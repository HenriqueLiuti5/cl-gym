import { agora, db, salvar } from "./db";
import { novoId } from "./ids";
import { ir } from "./rota";
import { sincronizar, sincronizarEmBreve } from "./sync";
import type { Serie, Sessao } from "./tipos";

export async function comecarTreino(fichaId: string | null): Promise<void> {
  const sessao: Sessao = {
    id: novoId(),
    atualizado_em: agora(),
    excluido: false,
    ficha_id: fichaId,
    iniciada_em: agora(),
    finalizada_em: null,
    observacao: null,
  };
  await salvar("sessoes", sessao);
  ir(`/treino/${sessao.id}`);
}

/** O treino começado e ainda não terminado (o mais recente, se houver mais de um). */
export async function treinoEmAndamento(): Promise<Sessao | undefined> {
  const abertos = await db.sessoes.filter((s) => !s.excluido && !s.finalizada_em).toArray();
  return abertos.sort((a, b) => b.iniciada_em.localeCompare(a.iniciada_em))[0];
}

export async function terminarTreino(sessao: Sessao): Promise<void> {
  await salvar("sessoes", { ...sessao, finalizada_em: agora() });
  ir("/");
  void sincronizar();
}

/** Descarta o treino: exclusão lógica da sessão e das séries dela. */
export async function cancelarTreino(sessao: Sessao): Promise<void> {
  const series = await db.series.where("sessao_id").equals(sessao.id).toArray();
  await db.transaction("rw", db.sessoes, db.series, async () => {
    for (const serie of series) await salvar("series", { ...serie, excluido: true });
    await salvar("sessoes", { ...sessao, excluido: true });
  });
  ir("/");
  sincronizarEmBreve();
}

/** Séries anotadas (não apagadas) do treino. */
export async function seriesAnotadas(sessaoId: string): Promise<number> {
  return db.series
    .where("sessao_id")
    .equals(sessaoId)
    .filter((s) => !s.excluido)
    .count();
}

// Gravar e apagar a série fazem o mesmo que o `salvar` (marcar como pendente), mas com a hora de
// quem chama: a linha do treino grava a cada tecla e reconhece por essa hora o eco da própria
// gravação (veja mudouPorFora em lib/linhaSerie.ts). Não sincronizam: as séries vão juntas no fim.

/** Grava a série (cria ou regrava pelo id). */
export async function gravarSerie(serie: Omit<Serie, "excluido" | "pendente" | "versao">): Promise<void> {
  await db.series.put({ ...serie, excluido: false, pendente: 1 });
}

/** Apaga a série (exclusão lógica). Vale mesmo com a gravação dela ainda em curso: a mudança
 * entra na fila do banco depois dela. */
export async function apagarSerie(id: string, atualizadoEm: string = agora()): Promise<void> {
  await db.series.update(id, { excluido: true, atualizado_em: atualizadoEm, pendente: 1 });
}
