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

export async function gravarSerie(serie: Omit<Serie, "atualizado_em" | "excluido" | "id"> & { id?: string }) {
  await salvar("series", { ...serie, excluido: false, atualizado_em: agora(), id: serie.id ?? novoId() });
}

export async function apagarSerie(serie: Serie): Promise<void> {
  await salvar("series", { ...serie, excluido: true });
}
