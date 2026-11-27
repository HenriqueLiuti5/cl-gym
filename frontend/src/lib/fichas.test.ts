import { describe, expect, it } from "vitest";

import {
  agruparPorGrupo,
  criarExercicio,
  filtrarExercicios,
  gruposDe,
  houveMudanca,
  itensDaFicha,
  montarGravacao,
  moverItem,
  normalizar,
  novoItem,
  planoBSugerido,
  problemasDoExercicio,
  problemasDoRascunho,
  proximaOrdem,
  rascunhoDe,
  registrosParaApagar,
  separarSugestoes,
  type Rascunho,
} from "./fichas";
import type { Exercicio, Ficha, FichaExercicio } from "./tipos";

const QUANDO = "2026-11-26T10:00:00.000Z";

const exercicio = (id: string, campos: Partial<Exercicio> = {}): Exercicio => ({
  id,
  atualizado_em: QUANDO,
  excluido: false,
  nome: id,
  grupo_muscular: "Peito",
  imagens: [],
  instrucoes: [],
  midia_url: null,
  ...campos,
});

const ficha = (id: string, ordem: number, campos: Partial<Ficha> = {}): Ficha => ({
  id,
  atualizado_em: QUANDO,
  excluido: false,
  nome: `Treino ${id}`,
  ordem,
  ...campos,
});

const item = (id: string, ordem: number, campos: Partial<FichaExercicio> = {}): FichaExercicio => ({
  id,
  atualizado_em: QUANDO,
  excluido: false,
  ficha_id: "f1",
  exercicio_id: `ex-${id}`,
  ordem,
  series: 3,
  alvo_reps: 10,
  aquecimento: false,
  grupo_biset: null,
  alternativas: [],
  observacao: null,
  ...campos,
});

const contador = () => {
  let n = 0;
  return () => `novo-${++n}`;
};

describe("itensDaFicha e rascunhoDe", () => {
  it("tiram os excluídos e seguem a ordem", () => {
    const itens = [item("b", 2), item("x", 1, { excluido: true }), item("a", 0)];
    expect(itensDaFicha(itens).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("partem do treino como está, com a observação em texto", () => {
    const r = rascunhoDe(ficha("f1", 1, { nome: "Push" }), [item("a", 0, { observacao: "Escápulas presas", alternativas: ["ex-z"] })]);
    expect(r).toEqual({
      nome: "Push",
      itens: [{ id: "a", exercicio_id: "ex-a", series: 3, alvo_reps: 10, aquecimento: false, alternativas: ["ex-z"], observacao: "Escápulas presas" }],
    });
    expect(rascunhoDe(null, [])).toEqual({ nome: "", itens: [] });
  });
});

describe("planoBSugerido e novoItem", () => {
  const porId = new Map(
    [exercicio("a", { substitutos: ["sumiu", "b", "a", "b", "c", "d"] }), exercicio("b"), exercicio("c"), exercicio("d"), exercicio("x", { excluido: true })].map(
      (e) => [e.id, e],
    ),
  );

  it("pega os 2 primeiros substitutos que existem, sem repetir nem o próprio", () => {
    expect(planoBSugerido(porId.get("a")!, porId)).toEqual(["b", "c"]);
  });

  it("ignora os excluídos e aceita exercício sem substitutos", () => {
    expect(planoBSugerido(exercicio("y", { substitutos: ["x", "d"] }), porId)).toEqual(["d"]);
    expect(planoBSugerido(exercicio("z"), porId)).toEqual([]);
  });

  it("entra com 3 × 10, aquecimento só no primeiro e o Plano B sugerido", () => {
    expect(novoItem(porId.get("a")!, porId, "id1", true)).toEqual({
      id: "id1",
      exercicio_id: "a",
      series: 3,
      alvo_reps: 10,
      aquecimento: true,
      alternativas: ["b", "c"],
      observacao: "",
    });
    expect(novoItem(porId.get("b")!, porId, "id2", false).aquecimento).toBe(false);
  });
});

describe("moverItem", () => {
  it("sobe e desce sem mexer no resto", () => {
    expect(moverItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moverItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("fora dos limites, fica como está", () => {
    const lista = ["a", "b"];
    expect(moverItem(lista, 0, -1)).toBe(lista);
    expect(moverItem(lista, 1, 2)).toBe(lista);
  });
});

describe("proximaOrdem", () => {
  it("vai depois da maior entre as ativas", () => {
    expect(proximaOrdem([ficha("a", 1), ficha("b", 4), ficha("c", 9, { excluido: true })])).toBe(5);
    expect(proximaOrdem([])).toBe(1);
  });
});

describe("problemasDoRascunho", () => {
  const valido = (): Rascunho => ({
    nome: "Push",
    itens: [{ id: "a", exercicio_id: "supino", series: 3, alvo_reps: 10, aquecimento: true, alternativas: ["crucifixo"], observacao: "" }],
  });

  it("aceita um treino com nome e exercício", () => {
    expect(problemasDoRascunho(valido())).toEqual([]);
  });

  it("diz o que falta: nome e pelo menos um exercício", () => {
    expect(problemasDoRascunho({ nome: "   ", itens: [] })).toEqual(["Dê um nome ao treino.", "Adicione pelo menos um exercício."]);
    expect(problemasDoRascunho({ ...valido(), nome: "x".repeat(61) })).toEqual(["O nome do treino pode ter até 60 caracteres."]);
    expect(problemasDoRascunho({ ...valido(), nome: ` ${"x".repeat(60)} ` })).toEqual([]);
  });

  it("segue os limites do servidor em cada exercício", () => {
    const r = valido();
    const base = r.itens[0]!;
    r.itens = [
      { ...base, series: 21, alvo_reps: 0 },
      { ...base, id: "b", alvo_reps: 10.5, observacao: "x".repeat(301) },
      { ...base, id: "c", alternativas: ["a", "a"] },
      { ...base, id: "d", alternativas: ["supino"] },
      { ...base, id: "e", alternativas: ["a", "b", "c"] },
    ];
    expect(problemasDoRascunho(r, () => "Supino")).toEqual([
      "Supino: as séries vão de 1 a 20.",
      "Supino: o alvo vai de 1 a 100 repetições.",
      "Supino: o alvo vai de 1 a 100 repetições.",
      "Supino: a observação pode ter até 300 caracteres.",
      "Supino: o Plano B repete um exercício.",
      "Supino: o Plano B não pode ter o próprio exercício.",
      "Supino: o Plano B tem no máximo 2 exercícios.",
    ]);
  });
});

describe("houveMudanca", () => {
  const inicial = rascunhoDe(ficha("f1", 1), [item("a", 0), item("b", 1)]);

  it("não conta espaços nas pontas nem o rascunho igual", () => {
    expect(houveMudanca(structuredClone(inicial), inicial)).toBe(false);
    expect(houveMudanca({ ...inicial, nome: ` ${inicial.nome} ` }, inicial)).toBe(false);
  });

  it("vê nome, ordem, números, Plano B e exercícios a mais ou a menos", () => {
    const [a, b] = inicial.itens as [Rascunho["itens"][0], Rascunho["itens"][0]];
    expect(houveMudanca({ ...inicial, nome: "Outro" }, inicial)).toBe(true);
    expect(houveMudanca({ ...inicial, itens: [b, a] }, inicial)).toBe(true);
    expect(houveMudanca({ ...inicial, itens: [{ ...a, series: 4 }, b] }, inicial)).toBe(true);
    expect(houveMudanca({ ...inicial, itens: [{ ...a, alternativas: ["z"] }, b] }, inicial)).toBe(true);
    expect(houveMudanca({ ...inicial, itens: [a] }, inicial)).toBe(true);
  });
});

describe("montarGravacao", () => {
  it("cria a ficha nova depois da maior ordem, com os itens em ordem e sem bi-set", () => {
    const r: Rascunho = {
      nome: "  Pernas  ",
      itens: [
        { id: "i1", exercicio_id: "agachamento", series: 4, alvo_reps: 8, aquecimento: true, alternativas: ["leg"], observacao: " Desce até 90° " },
        { id: "i2", exercicio_id: "cadeira", series: 3, alvo_reps: 12, aquecimento: false, alternativas: [], observacao: "  " },
      ],
    };
    const g = montarGravacao(r, { ficha: null, itens: [], fichas: [ficha("a", 2), ficha("b", 7, { excluido: true })] }, contador(), QUANDO);
    expect(g.ficha).toEqual({ id: "novo-1", atualizado_em: QUANDO, excluido: false, nome: "Pernas", ordem: 3 });
    expect(g.fichaId).toBe("novo-1");
    expect(g.itens).toEqual([
      {
        id: "i1",
        atualizado_em: QUANDO,
        excluido: false,
        ficha_id: "novo-1",
        exercicio_id: "agachamento",
        ordem: 0,
        series: 4,
        alvo_reps: 8,
        aquecimento: true,
        grupo_biset: null,
        alternativas: ["leg"],
        observacao: "Desce até 90°",
      },
      {
        id: "i2",
        atualizado_em: QUANDO,
        excluido: false,
        ficha_id: "novo-1",
        exercicio_id: "cadeira",
        ordem: 1,
        series: 3,
        alvo_reps: 12,
        aquecimento: false,
        grupo_biset: null,
        alternativas: [],
        observacao: null,
      },
    ]);
  });

  const f1 = ficha("f1", 1, { nome: "Push" });
  const antes = [item("a", 0, { grupo_biset: 1 }), item("b", 1, { grupo_biset: 1 }), item("c", 2), item("velho", 3, { excluido: true })];

  it("sem mudança, não grava nada", () => {
    const g = montarGravacao(rascunhoDe(f1, antes), { ficha: f1, itens: antes, fichas: [f1] }, contador(), QUANDO);
    expect(g).toEqual({ fichaId: "f1", ficha: null, itens: [] });
  });

  it("grava só a ficha se só o nome mudou", () => {
    const r = { ...rascunhoDe(f1, antes), nome: "Peito e ombro" };
    const g = montarGravacao(r, { ficha: f1, itens: antes, fichas: [f1] }, contador(), QUANDO);
    expect(g.ficha).toEqual({ ...f1, nome: "Peito e ombro" });
    expect(g.itens).toEqual([]);
  });

  it("regrava só os itens alterados, refaz a ordem, exclui os que saíram e guarda o bi-set antigo", () => {
    const r = rascunhoDe(f1, antes);
    const [, b, c] = r.itens as [Rascunho["itens"][0], Rascunho["itens"][0], Rascunho["itens"][0]];
    // Tira o "a", sobe o "c" para antes do "b" e muda as séries do "c"; entra um novo no fim.
    r.itens = [{ ...c, series: 5 }, b, { id: "n1", exercicio_id: "remada", series: 3, alvo_reps: 10, aquecimento: false, alternativas: [], observacao: "" }];
    const g = montarGravacao(r, { ficha: f1, itens: antes, fichas: [f1] }, contador(), QUANDO);
    expect(g.ficha).toBeNull();
    expect(g.itens.map((i) => [i.id, i.ordem, i.series, i.excluido, i.grupo_biset])).toEqual([
      ["c", 0, 5, false, null],
      ["n1", 2, 3, false, null],
      ["a", 0, 3, true, 1],
    ]);
    // O "b" ficou na mesma posição e sem mudança: não vai de novo.
    expect(g.itens.find((i) => i.id === "b")).toBeUndefined();
  });

  it("vê mudança de Plano B, aquecimento e observação", () => {
    const r = rascunhoDe(f1, antes);
    r.itens[0] = { ...r.itens[0]!, alternativas: ["x"] };
    r.itens[1] = { ...r.itens[1]!, aquecimento: true };
    r.itens[2] = { ...r.itens[2]!, observacao: "Devagar" };
    const g = montarGravacao(r, { ficha: f1, itens: antes, fichas: [f1] }, contador(), QUANDO);
    expect(g.itens.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(g.itens[0]!.grupo_biset).toBe(1);
    expect(g.itens[2]!.observacao).toBe("Devagar");
  });
});

describe("registrosParaApagar", () => {
  it("exclui a ficha e os itens ativos dela", () => {
    const f1 = ficha("f1", 1);
    const r = registrosParaApagar(f1, [item("a", 0), item("b", 1, { excluido: true }), item("c", 0, { ficha_id: "outra" })]);
    expect(r.ficha).toEqual({ ...f1, excluido: true });
    expect(r.itens.map((i) => [i.id, i.excluido])).toEqual([["a", true]]);
  });
});

describe("seletor de exercícios", () => {
  const lista = [
    exercicio("rosca", { nome: "Rosca direta", grupo_muscular: "Bíceps" }),
    exercicio("supino-h", { nome: "Supino inclinado com halter", substitutos: ["supino-m", "crucifixo"] }),
    exercicio("supino-m", { nome: "Supino inclinado na máquina" }),
    exercicio("crucifixo", { nome: "Crucifixo na máquina" }),
    exercicio("apagado", { nome: "Supino velho", excluido: true }),
  ];

  it("busca sem acento, palavra por palavra, sem os excluídos", () => {
    expect(normalizar("  Bíceps ")).toBe("biceps");
    expect(filtrarExercicios(lista, "supino halter", null).map((e) => e.id)).toEqual(["supino-h"]);
    expect(filtrarExercicios(lista, "SUPINO", null).map((e) => e.id)).toEqual(["supino-h", "supino-m"]);
    expect(filtrarExercicios(lista, "", "Bíceps").map((e) => e.id)).toEqual(["rosca"]);
    expect(filtrarExercicios(lista, "maquina", "Peito").map((e) => e.id)).toEqual(["crucifixo", "supino-m"]);
  });

  it("lista os grupos e agrupa na ordem do catálogo, não na alfabética", () => {
    expect(gruposDe(lista)).toEqual(["Peito", "Bíceps"]);
    expect(agruparPorGrupo(filtrarExercicios(lista, "", null)).map((g) => [g.grupo, g.itens.length])).toEqual([
      ["Peito", 3],
      ["Bíceps", 1],
    ]);
  });

  it("põe um grupo primeiro e os desconhecidos no fim, em ordem alfabética", () => {
    const varios = [
      ...lista,
      exercicio("prancha", { nome: "Prancha", grupo_muscular: "Abdômen" }),
      exercicio("x", { nome: "X", grupo_muscular: "Pescoço" }),
      exercicio("y", { nome: "Y", grupo_muscular: "Cardio" }),
    ];
    expect(gruposDe(varios)).toEqual(["Peito", "Bíceps", "Abdômen", "Cardio", "Pescoço"]);
    expect(agruparPorGrupo(filtrarExercicios(varios, "", null), "Bíceps").map((g) => g.grupo)).toEqual([
      "Bíceps",
      "Peito",
      "Abdômen",
      "Cardio",
      "Pescoço",
    ]);
  });

  it("no Plano B, mostra os substitutos primeiro, na ordem deles", () => {
    const visiveis = filtrarExercicios(lista, "", null).filter((e) => e.id !== "supino-h");
    const { sugestoes, resto } = separarSugestoes(lista[1], visiveis);
    expect(sugestoes.map((e) => e.id)).toEqual(["supino-m", "crucifixo"]);
    expect(resto.map((e) => e.id)).toEqual(["rosca"]);
    expect(separarSugestoes(undefined, visiveis).sugestoes).toEqual([]);
  });
});

describe("criar exercício", () => {
  it("pede nome e grupo, sem repetir um que já existe", () => {
    const lista = [exercicio("a", { nome: "Rosca direta" })];
    expect(problemasDoExercicio("Rosca martelo", "Bíceps", lista)).toEqual([]);
    expect(problemasDoExercicio("  ", null, lista)).toEqual(["Dê um nome ao exercício.", "Escolha o grupo muscular."]);
    expect(problemasDoExercicio("rosca DIRETA ", "Bíceps", lista)).toEqual(["Já existe um exercício com esse nome. Procure-o na lista."]);
    expect(problemasDoExercicio("x".repeat(121), "Bíceps", lista)).toEqual(["O nome pode ter até 120 caracteres."]);
  });

  it("grava sem imagens, passos, vídeo nem substitutos", () => {
    expect(criarExercicio(" Rosca martelo ", " Bíceps ", "id1", QUANDO)).toEqual({
      id: "id1",
      atualizado_em: QUANDO,
      excluido: false,
      nome: "Rosca martelo",
      grupo_muscular: "Bíceps",
      imagens: [],
      instrucoes: [],
      midia_url: null,
      substitutos: [],
    });
  });
});
