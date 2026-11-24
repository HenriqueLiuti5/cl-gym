import Dexie, { type EntityTable } from "dexie";

import type {
  Exercicio,
  Ficha,
  FichaExercicio,
  NomeTabela,
  Registros,
  RegistroDiario,
  Serie,
  Sessao,
} from "./tipos";

interface Meta {
  chave: string;
  valor: unknown;
}

/** Banco local (IndexedDB). As telas leem só daqui; o servidor é a cópia na nuvem. */
export const db = new Dexie("cl-gym") as Dexie & {
  exercicios: EntityTable<Exercicio, "id">;
  fichas: EntityTable<Ficha, "id">;
  ficha_exercicios: EntityTable<FichaExercicio, "id">;
  sessoes: EntityTable<Sessao, "id">;
  series: EntityTable<Serie, "id">;
  registros_diarios: EntityTable<RegistroDiario, "id">;
  meta: EntityTable<Meta, "chave">;
};

db.version(1).stores({
  exercicios: "id, pendente",
  fichas: "id, pendente",
  ficha_exercicios: "id, ficha_id, pendente",
  sessoes: "id, ficha_id, iniciada_em, pendente",
  series: "id, sessao_id, exercicio_id, pendente",
  registros_diarios: "id, data, pendente",
  meta: "chave",
});

export function tabela<T extends NomeTabela>(nome: T): EntityTable<Registros[T], "id"> {
  return db[nome] as unknown as EntityTable<Registros[T], "id">;
}

export async function lerMeta<T>(chave: string): Promise<T | undefined> {
  return (await db.meta.get(chave))?.valor as T | undefined;
}

export async function gravarMeta(chave: string, valor: unknown): Promise<void> {
  await db.meta.put({ chave, valor });
}

export function agora(): string {
  return new Date().toISOString();
}

/** Grava uma mudança feita no app: marca como pendente para o próximo envio. */
export async function salvar<T extends NomeTabela>(nome: T, registro: Registros[T]): Promise<void> {
  await tabela(nome).put({ ...registro, atualizado_em: agora(), pendente: 1 });
}

export async function apagarTudo(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
