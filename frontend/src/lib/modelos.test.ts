import { describe, expect, it } from "vitest";

import { copiarModelo, copiarModelos, listarTreinos, proximaOrdem, resumoDoTreino, type Modelo } from "./modelos";
import type { Ficha, Sessao } from "./tipos";

const base = { atualizado_em: "2026-11-01T00:00:00Z", excluido: false };
const QUANDO = "2026-11-26T12:00:00.000Z";

const ficha = (id: string, ordem: number, extra: Partial<Ficha> = {}): Ficha => ({ ...base, id, nome: id, ordem, ...extra });

const sessao = (id: string, fichaId: string | null, quando: string, extra: Partial<Sessao> = {}): Sessao => ({
  ...base,
  id,
  ficha_id: fichaId,
  iniciada_em: quando,
  finalizada_em: quando,
  observacao: null,
  ...extra,
});

const push: Modelo = {
  id: "modelo-push",
  nome: "Push",
  ordem: 1,
  exercicios: [
    {
      exercicio_id: "supino",
      ordem: 0,
      series: 3,
      alvo_reps: 8,
      aquecimento: true,
      alternativas: ["supino-halter", "flexao"],
      observacao: "Escápulas para trás",
    },
    { exercicio_id: "triceps", ordem: 1, series: 2, alvo_reps: 12, aquecimento: false, alternativas: [], observacao: null },
  ],
};

const pull: Modelo = {
  id: "modelo-pull",
  nome: "Pull",
  ordem: 2,
  exercicios: [{ exercicio_id: "remada", ordem: 0, series: 4, alvo_reps: 10, aquecimento: true, alternativas: [], observacao: null }],
};

/** Gera "id-1", "id-2"... para os testes saberem quais ids saíram. */
function contador() {
  let n = 0;
  return () => `id-${++n}`;
}

describe("copiarModelo", () => {
  it("dá ids novos, diferentes dos do modelo e entre si", () => {
    const { ficha, itens } = copiarModelo(push, 5, contador(), QUANDO);
    const ids = [ficha.id, ...itens.map((i) => i.id)];
    expect(ids).toEqual(["id-1", "id-2", "id-3"]);
    expect(ids).not.toContain(push.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("liga os itens à ficha nova e põe a ficha na ordem dada, com o nome do modelo", () => {
    const { ficha, itens } = copiarModelo(push, 5, contador(), QUANDO);
    expect(ficha).toEqual({ id: "id-1", atualizado_em: QUANDO, excluido: false, nome: "Push", ordem: 5 });
    expect(itens.every((i) => i.ficha_id === ficha.id)).toBe(true);
  });

  it("copia os campos dos exercícios, sem bi-set e sem excluir", () => {
    const { itens } = copiarModelo(push, 1, contador(), QUANDO);
    expect(itens[0]).toEqual({
      id: "id-2",
      atualizado_em: QUANDO,
      excluido: false,
      ficha_id: "id-1",
      exercicio_id: "supino",
      ordem: 0,
      series: 3,
      alvo_reps: 8,
      aquecimento: true,
      grupo_biset: null,
      alternativas: ["supino-halter", "flexao"],
      observacao: "Escápulas para trás",
    });
    expect(itens[1]).toMatchObject({
      exercicio_id: "triceps",
      ordem: 1,
      series: 2,
      alvo_reps: 12,
      aquecimento: false,
      grupo_biset: null,
      alternativas: [],
      observacao: null,
    });
  });

  it("não compartilha a lista de alternativas com o modelo", () => {
    const { itens } = copiarModelo(push, 1, contador(), QUANDO);
    itens[0]!.alternativas.push("outro");
    expect(push.exercicios[0]!.alternativas).toEqual(["supino-halter", "flexao"]);
  });

  it("modelo sem exercícios vira só a ficha", () => {
    const { ficha, itens } = copiarModelo({ ...push, exercicios: [] }, 1, contador(), QUANDO);
    expect(ficha.nome).toBe("Push");
    expect(itens).toEqual([]);
  });
});

describe("copiarModelos", () => {
  it("copia na ordem da lista, com ordens seguidas e ids que não se repetem", () => {
    const copias = copiarModelos([push, pull], 3, contador(), QUANDO);
    expect(copias.map((c) => [c.ficha.nome, c.ficha.ordem])).toEqual([
      ["Push", 3],
      ["Pull", 4],
    ]);
    const ids = copias.flatMap((c) => [c.ficha.id, ...c.itens.map((i) => i.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(copias[1]!.itens[0]!.ficha_id).toBe(copias[1]!.ficha.id);
  });
});

describe("proximaOrdem", () => {
  it("vai depois da maior ordem das fichas ativas", () => {
    expect(proximaOrdem([ficha("a", 2), ficha("b", 7), ficha("c", 9, { excluido: true })])).toBe(8);
  });

  it("começa em 1 sem fichas (ou só com excluídas)", () => {
    expect(proximaOrdem([])).toBe(1);
    expect(proximaOrdem([ficha("a", 4, { excluido: true })])).toBe(1);
  });
});

describe("resumoDoTreino", () => {
  it("conta exercícios e séries, sem os excluídos", () => {
    expect(resumoDoTreino([{ series: 3 }, { series: 4 }, { series: 5, excluido: true }])).toBe("2 exercícios · 7 séries");
    expect(resumoDoTreino(push.exercicios)).toBe("2 exercícios · 5 séries");
  });

  it("usa o singular", () => {
    expect(resumoDoTreino([{ series: 1 }])).toBe("1 exercício · 1 série");
  });

  it("sem exercícios", () => {
    expect(resumoDoTreino([])).toBe("Nenhum exercício");
    expect(resumoDoTreino([{ series: 3, excluido: true }])).toBe("Nenhum exercício");
  });
});

describe("listarTreinos", () => {
  it("mostra as fichas ativas na ordem, com desempate pelo nome", () => {
    const fichas = [
      ficha("Upper", 3),
      ficha("Pull", 1),
      ficha("Leg day", 2),
      ficha("Arms", 2),
      ficha("Velha", 0, { excluido: true }),
    ];
    expect(listarTreinos(fichas, []).map((t) => t.ficha.id)).toEqual(["Pull", "Arms", "Leg day", "Upper"]);
  });

  it("não segue a sugestão do dia: a feita há mais tempo não sobe", () => {
    const fichas = [ficha("Push", 1), ficha("Pull", 2)];
    const sessoes = [sessao("s1", "Push", "2026-11-20T10:00:00Z")];
    expect(listarTreinos(fichas, sessoes).map((t) => t.ficha.id)).toEqual(["Push", "Pull"]);
  });

  it("última vez é o início mais recente entre as sessões finalizadas e não excluídas", () => {
    const fichas = [ficha("Push", 1), ficha("Pull", 2)];
    const sessoes = [
      sessao("s1", "Push", "2026-11-10T10:00:00Z"),
      sessao("s2", "Push", "2026-11-18T10:00:00Z"),
      sessao("s3", "Push", "2026-11-22T10:00:00Z", { excluido: true }),
      sessao("s4", "Push", "2026-11-24T10:00:00Z", { finalizada_em: null }),
      sessao("s5", "Pull", "2026-11-25T10:00:00Z", { finalizada_em: null }),
      sessao("s6", null, "2026-11-26T10:00:00Z"),
    ];
    expect(listarTreinos(fichas, sessoes)).toEqual([
      { ficha: fichas[0], ultima: "2026-11-18T10:00:00Z" },
      { ficha: fichas[1], ultima: null },
    ]);
  });

  it("compara as datas pelo instante, não pelo texto", () => {
    const fichas = [ficha("Push", 1)];
    const sessoes = [sessao("s1", "Push", "2026-11-20T09:00:00-03:00"), sessao("s2", "Push", "2026-11-20T11:00:00Z")];
    expect(listarTreinos(fichas, sessoes)[0]!.ultima).toBe("2026-11-20T09:00:00-03:00");
  });

  it("não mexe na lista recebida", () => {
    const fichas = [ficha("B", 2), ficha("A", 1)];
    listarTreinos(fichas, []);
    expect(fichas.map((f) => f.id)).toEqual(["B", "A"]);
  });
});
