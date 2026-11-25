import { describe, expect, it } from "vitest";

import { comparacaoDeAltura, comparacaoDePeso, curiosidades } from "./curiosidades";
import {
  calendario,
  constanciaDoRegistro,
  diasNaMeta,
  escala,
  exerciciosFeitos,
  imc,
  maiorEvolucao,
  maiorPausa,
  maiorSequenciaDeDias,
  mediaPorSemana,
  mediaRecente,
  montarTreinos,
  origemDasCalorias,
  periodoDoDia,
  porDia,
  pontosDePeso,
  previsaoDaMeta,
  recordes,
  resumoExercicio,
  resumoTreinos,
  ritmoDoPeso,
  sequenciaDeSemanas,
  seriesPorGrupo,
  treinosPorSemana,
  variacaoPorSemana,
  vezesPlanoB,
} from "./estatisticas";
import { somarDias } from "./regras";
import type { Exercicio, FichaExercicio, RegistroDiario, Serie, Sessao } from "./tipos";

// Meio da tarde em UTC: cai no mesmo dia em qualquer fuso do Brasil.
const sessao = (id: string, data: string, minutos = 60, campos: Partial<Sessao> = {}): Sessao => ({
  id,
  atualizado_em: `${data}T15:00:00Z`,
  excluido: false,
  ficha_id: "push",
  iniciada_em: `${data}T15:00:00Z`,
  finalizada_em: new Date(Date.parse(`${data}T15:00:00Z`) + minutos * 60_000).toISOString(),
  observacao: null,
  ...campos,
});

let contador = 0;
const serie = (sessaoId: string, exercicioId: string, carga: number, reps: number, campos: Partial<Serie> = {}): Serie => ({
  id: `s${++contador}`,
  atualizado_em: "2026-11-01T00:00:00Z",
  excluido: false,
  sessao_id: sessaoId,
  exercicio_id: exercicioId,
  ficha_exercicio_id: "item-supino",
  numero: contador,
  carga_kg: carga,
  repeticoes: reps,
  ...campos,
});

const exercicio = (id: string, nome: string, grupo: string): Exercicio => ({
  id,
  atualizado_em: "2026-11-01T00:00:00Z",
  excluido: false,
  nome,
  grupo_muscular: grupo,
  imagens: [],
  instrucoes: [],
  midia_url: null,
});

const registro = (data: string, campos: Partial<RegistroDiario> = {}): RegistroDiario => ({
  id: data,
  atualizado_em: `${data}T08:00:00Z`,
  excluido: false,
  data,
  peso_kg: null,
  kcal: null,
  proteina_g: null,
  carbo_g: null,
  agua_ml: null,
  observacao: null,
  ...campos,
});

const SUPINO = exercicio("supino", "Supino reto", "Peito");
const SUPINO_HALTER = exercicio("supino-halter", "Supino com halter", "Peito");
const REMADA = exercicio("remada", "Remada baixa", "Costas");
const EXERCICIOS = [SUPINO, SUPINO_HALTER, REMADA];

const SESSOES = [
  sessao("a", "2026-11-02"), // segunda
  sessao("b", "2026-11-04", 75),
  sessao("c", "2026-11-05", 600), // esqueceram de terminar: duração desconhecida
  sessao("d", "2026-11-12"),
  sessao("aberta", "2026-11-13", 60, { finalizada_em: null }),
  sessao("descartada", "2026-11-14", 60, { excluido: true }),
];
const SERIES = [
  serie("a", "supino", 40, 10),
  serie("a", "supino", 40, 8),
  serie("a", "remada", 50, 10, { ficha_exercicio_id: "item-remada" }),
  serie("b", "supino", 42.5, 8),
  serie("c", "supino-halter", 16, 10), // Plano B do item do supino
  serie("d", "supino", 45, 6),
  serie("d", "supino", 40, 12, { excluido: true }),
];
const ITENS = [
  { id: "item-supino", exercicio_id: "supino" },
  { id: "item-remada", exercicio_id: "remada" },
] as FichaExercicio[];

const TREINOS = montarTreinos(SESSOES, SERIES);

describe("treinos", () => {
  it("só conta os terminados e não descartados, com volume e duração", () => {
    expect(TREINOS.map((t) => t.sessao.id)).toEqual(["a", "b", "c", "d"]);
    expect(TREINOS[0]!.volume).toBe(40 * 10 + 40 * 8 + 50 * 10);
    expect(TREINOS[2]!.minutos).toBeNull();
    const resumo = resumoTreinos(TREINOS);
    expect(resumo).toMatchObject({ total: 4, series: 6, reps: 52, minutos: 195 });
    expect(resumo.maisLongo?.sessao.id).toBe("b");
  });

  it("por semana, com as semanas vazias", () => {
    const semanas = treinosPorSemana(TREINOS, "2026-11-02", "2026-11-24");
    expect(semanas.map((s) => s.total)).toEqual([3, 1, 0, 0]);
    expect(semanas[0]!.semana).toBe("2026-11-02");
  });

  it("sequência de semanas: a semana atual não quebra enquanto não acaba", () => {
    expect(sequenciaDeSemanas([{ total: 4 }, { total: 4 }, { total: 2 }], 4)).toEqual({ atual: 2, melhor: 2 });
    expect(sequenciaDeSemanas([{ total: 4 }, { total: 1 }, { total: 4 }, { total: 5 }], 4)).toEqual({ atual: 2, melhor: 2 });
    expect(sequenciaDeSemanas([{ total: 4 }, { total: 1 }, { total: 0 }], 4)).toEqual({ atual: 0, melhor: 1 });
  });

  it("calendário: colunas de segunda a domingo até a semana de hoje", () => {
    const grade = calendario(TREINOS, 2, "2026-11-12");
    expect(grade).toHaveLength(2);
    expect(grade[0]![0]!.data).toBe("2026-11-02");
    expect(grade[0]![0]!.treinos).toHaveLength(1);
    expect(grade[1]![3]!.data).toBe("2026-11-12");
    expect(grade[1]![4]!.futuro).toBe(true);
  });

  it("sequências e pausas", () => {
    expect(maiorSequenciaDeDias(["2026-11-04", "2026-11-02", "2026-11-05", "2026-11-05"])).toBe(2);
    expect(maiorPausa(TREINOS)).toEqual({ dias: 6, de: "2026-11-05", ate: "2026-11-12" });
  });

  it("período do dia", () => {
    expect([3, 6, 13, 19].map(periodoDoDia)).toEqual(["madrugada", "manhã", "tarde", "noite"]);
  });

  it("séries por grupo muscular e Plano B", () => {
    expect(seriesPorGrupo(TREINOS, EXERCICIOS)).toEqual([
      { grupo: "Peito", series: 5 },
      { grupo: "Costas", series: 1 },
    ]);
    expect(vezesPlanoB(TREINOS, ITENS)).toBe(1);
  });
});

describe("exercícios", () => {
  it("resumo: maior carga por treino, recorde e 1RM estimado", () => {
    const r = resumoExercicio(SUPINO, TREINOS)!;
    expect(r.pontos.map((p) => p.valor)).toEqual([40, 42.5, 45]);
    expect(r.recorde).toMatchObject({ valor: 45, reps: 6, data: "2026-11-12" });
    expect(r.ultima.series).toHaveLength(1);
    expect(r.e1rm).toMatchObject({ valor: 54, carga: 45, reps: 6 }); // 45 × (1 + 6/30)
    expect(r.volume).toBe(400 + 320 + 340 + 270);
    expect(resumoExercicio(exercicio("x", "Nunca feito", "Perna"), TREINOS)).toBeNull();
  });

  it("recordes não contam a primeira vez", () => {
    const lista = recordes(exerciciosFeitos(TREINOS, EXERCICIOS));
    expect(lista.map((r) => [r.exercicio.id, r.carga, r.anterior])).toEqual([
      ["supino", 45, 42.5],
      ["supino", 42.5, 40],
    ]);
  });

  it("maior evolução precisa de 3 treinos", () => {
    const evolucao = maiorEvolucao(exerciciosFeitos(TREINOS, EXERCICIOS));
    expect(evolucao).toMatchObject({ de: 40, para: 45, ganho: 5 });
    expect(evolucao!.fracao).toBeCloseTo(0.125);
  });
});

describe("corpo", () => {
  // Cai 0,3 kg por semana, pesando todo dia.
  const registros = Array.from({ length: 35 }, (_, i) =>
    registro(somarDias("2026-10-20", i), { peso_kg: Math.round((85 - (0.3 * i) / 7) * 100) / 100 }),
  );
  const pontos = pontosDePeso(registros);
  const hoje = "2026-11-23";

  it("ritmo pela reta dos últimos 28 dias", () => {
    expect(ritmoDoPeso(pontos, hoje)).toBeCloseTo(-0.3, 2);
    expect(ritmoDoPeso(pontos.slice(0, 3), hoje)).toBeNull();
  });

  it("previsão só quando está indo para a meta", () => {
    expect(previsaoDaMeta(80, 78, -0.4, hoje)).toEqual({ semanas: 5, data: "2026-12-28" });
    expect(previsaoDaMeta(80, 78, 0.2, hoje)).toBeNull();
    expect(previsaoDaMeta(80, 78, null, hoje)).toBeNull();
  });

  it("variação semana a semana", () => {
    const semanas = variacaoPorSemana(pontos);
    expect(semanas.length).toBeGreaterThan(3);
    for (const s of semanas.slice(1, -1)) expect(s.variacao).toBeCloseTo(-0.3, 1);
  });

  it("IMC", () => {
    expect(imc(80, 178).valor).toBeCloseTo(25.25, 2);
    expect(imc(80, 178).faixa).toBe("sobrepeso");
    expect(imc(70, 178).faixa).toBe("peso normal");
  });
});

describe("alimentação e água", () => {
  const hoje = "2026-11-10";
  const registros = [
    registro("2026-11-01", { kcal: 2000, proteina_g: 150, carbo_g: 200 }),
    registro("2026-11-08", { kcal: 2400, proteina_g: 140, carbo_g: 300, agua_ml: 3000 }),
    registro("2026-11-09", { kcal: 2200, agua_ml: 2000 }),
    registro("2026-11-10", { proteina_g: 160 }),
  ];

  it("por dia, com os dias vazios", () => {
    expect(porDia(registros, "agua_ml", 3, hoje).map((d) => d.valor)).toEqual([3000, 2000, null]);
  });

  it("média por semana e recente, só dos dias lançados", () => {
    const semanas = mediaPorSemana(registros, "kcal", 2, hoje);
    // 08/11 é domingo (fecha a semana de 02/11); 09/11 abre a seguinte.
    expect(semanas).toEqual([
      { semana: "2026-11-02", valor: 2400, dias: 1 },
      { semana: "2026-11-09", valor: 2200, dias: 1 },
    ]);
    expect(mediaRecente(registros, "proteina_g", 7, hoje)).toBe(150);
  });

  it("dias na meta", () => {
    expect(diasNaMeta(registros, "agua_ml", 7, hoje, (v) => v >= 2500)).toEqual({ na: 1, lancados: 2 });
  });

  it("origem das calorias: proteína e carbo a 4 kcal por grama", () => {
    const origem = origemDasCalorias(registros, 7, hoje)!;
    expect(origem).toEqual({ kcal: 2400, proteina: 560, carbo: 1200, resto: 640, dias: 1 });
    expect(origemDasCalorias([], 7, hoje)).toBeNull();
  });

  it("constância do registro", () => {
    expect(constanciaDoRegistro(registros, hoje)).toEqual({ dias: 10, lancados: 4 });
  });
});

describe("curiosidades", () => {
  it("comparações de peso e altura", () => {
    expect(comparacaoDePeso(182_000)).toBe("30 elefantes-africanos");
    expect(comparacaoDePeso(400_000)).toBe("3 baleias-azuis");
    expect(comparacaoDePeso(1_500)).toBe("21 geladeiras"); // o maior objeto que cabe 2 vezes
    expect(comparacaoDePeso(100)).toBe("uma geladeira");
    expect(comparacaoDePeso(30)).toBeNull();
    expect(comparacaoDeAltura(12_000)).toBe("você teria subido 2,2 km: 5,5 vezes o Pão de Açúcar");
    expect(comparacaoDeAltura(100)).toBe("você teria subido 18 m");
  });

  it("monta a lista a partir do histórico, e nada sem dados", () => {
    const lista = curiosidades({
      treinos: TREINOS,
      exercicios: EXERCICIOS,
      itens: ITENS,
      registros: [registro("2026-11-01", { peso_kg: 82, agua_ml: 2000, proteina_g: 120 }), registro("2026-11-09", { peso_kg: 81 })],
      hoje: "2026-11-12",
    });
    const titulos = lista.map((c) => c.titulo);
    expect(titulos).toEqual(expect.arrayContaining(["Peso levantado", "Exercício favorito", "Recordes batidos", "Plano B", "Água bebida"]));
    expect(lista.find((c) => c.titulo === "Exercício favorito")?.valor).toBe("Supino reto");
    expect(curiosidades({ treinos: [], exercicios: [], itens: [], registros: [], hoje: "2026-11-12" })).toEqual([]);
  });
});

describe("escala", () => {
  it("marcas redondas que cobrem os dados", () => {
    expect(escala(0, 2901)).toEqual({ dominio: [0, 3000], marcas: [0, 1000, 2000, 3000] });
    expect(escala(52.3, 61.2).marcas).toEqual([50, 52.5, 55, 57.5, 60, 62.5]); // passo de 2,5 (anilhas!)
    expect(escala(-0.7, 0.7).marcas).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(escala(0, 4).marcas).toEqual([0, 1, 2, 3, 4]);
    expect(escala(5, 5).marcas[0]).toBeLessThanOrEqual(5);
  });
});
