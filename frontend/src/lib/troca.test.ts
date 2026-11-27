import { describe, expect, it } from "vitest";

import type { UltimaVez } from "./regras";
import type { Exercicio, Serie, Sessao } from "./tipos";
import { opcoesDeTroca, podeTrocar, resumoUltimaVez } from "./troca";

const base = { atualizado_em: "2026-11-01T00:00:00Z", excluido: false };

const exercicio = (id: string, extra: Partial<Exercicio> = {}): Exercicio => ({
  ...base,
  id,
  nome: id,
  grupo_muscular: "Peito",
  imagens: [],
  instrucoes: [],
  midia_url: null,
  usuario_id: null,
  ...extra,
});

const mapa = (...lista: Exercicio[]) => new Map(lista.map((e) => [e.id, e]));

const ids = (opcoes: ReturnType<typeof opcoesDeTroca>) => opcoes.map((o) => [o.exercicio.id, o.origem]);

describe("opcoesDeTroca", () => {
  it("planejado, depois o Plano B na ordem, depois os substitutos do planejado", () => {
    const exercicios = mapa(
      exercicio("supino", { substitutos: ["maquina", "flexao"] }),
      exercicio("halteres"),
      exercicio("crucifixo"),
      exercicio("maquina"),
      exercicio("flexao"),
    );
    const item = { exercicio_id: "supino", alternativas: ["halteres", "crucifixo"] };
    expect(ids(opcoesDeTroca(item, exercicios))).toEqual([
      ["supino", "planejado"],
      ["halteres", "planoB"],
      ["crucifixo", "planoB"],
      ["maquina", "substituto"],
      ["flexao", "substituto"],
    ]);
  });

  it("não repete: o que já é Plano B não volta como substituto", () => {
    const exercicios = mapa(
      exercicio("supino", { substitutos: ["halteres", "supino", "maquina", "maquina"] }),
      exercicio("halteres"),
      exercicio("maquina"),
    );
    const item = { exercicio_id: "supino", alternativas: ["halteres", "halteres"] };
    expect(ids(opcoesDeTroca(item, exercicios))).toEqual([
      ["supino", "planejado"],
      ["halteres", "planoB"],
      ["maquina", "substituto"],
    ]);
  });

  it("deixa de fora os que não estão no banco local ou foram excluídos", () => {
    const exercicios = mapa(
      exercicio("supino", { substitutos: ["sumiu", "apagado", "maquina"] }),
      exercicio("apagado", { excluido: true }),
      exercicio("maquina"),
    );
    const item = { exercicio_id: "supino", alternativas: ["nao-baixado", "apagado"] };
    expect(ids(opcoesDeTroca(item, exercicios))).toEqual([
      ["supino", "planejado"],
      ["maquina", "substituto"],
    ]);
  });

  it("sem o campo substitutos (registro antigo), só o planejado e o Plano B", () => {
    const exercicios = mapa(exercicio("supino"), exercicio("halteres"));
    expect(ids(opcoesDeTroca({ exercicio_id: "supino", alternativas: ["halteres"] }, exercicios))).toEqual([
      ["supino", "planejado"],
      ["halteres", "planoB"],
    ]);
    expect(ids(opcoesDeTroca({ exercicio_id: "supino", alternativas: [] }, exercicios))).toEqual([["supino", "planejado"]]);
  });

  it("planejado fora do banco local: sobra o Plano B", () => {
    const exercicios = mapa(exercicio("halteres"));
    expect(ids(opcoesDeTroca({ exercicio_id: "supino", alternativas: ["halteres"] }, exercicios))).toEqual([
      ["halteres", "planoB"],
    ]);
  });
});

describe("podeTrocar", () => {
  const exercicios = mapa(exercicio("supino", { substitutos: ["maquina"] }), exercicio("maquina"));
  const opcoes = opcoesDeTroca({ exercicio_id: "supino", alternativas: [] }, exercicios);

  it("precisa de pelo menos uma opção além da atual", () => {
    expect(podeTrocar(opcoes, "supino")).toBe(true);
    expect(podeTrocar(opcoes, "maquina")).toBe(true);
    expect(podeTrocar(opcoes.slice(0, 1), "supino")).toBe(false);
    expect(podeTrocar([], "supino")).toBe(false);
  });

  it("feito num exercício que não está entre as opções: dá para voltar a elas", () => {
    expect(podeTrocar(opcoes.slice(0, 1), "outro")).toBe(true);
  });
});

describe("resumoUltimaVez", () => {
  const sessao: Sessao = {
    ...base,
    id: "s1",
    ficha_id: null,
    iniciada_em: "2026-11-20T10:00:00Z",
    finalizada_em: "2026-11-20T11:00:00Z",
    observacao: null,
  };
  const serie = (numero: number, carga_kg: number, repeticoes: number): Serie => ({
    ...base,
    id: `s1-${numero}`,
    sessao_id: "s1",
    exercicio_id: "supino",
    ficha_exercicio_id: null,
    numero,
    carga_kg,
    repeticoes,
  });

  it("a 1ª série da última vez, em português", () => {
    const ultima: UltimaVez = { sessao, series: [serie(1, 22.5, 8), serie(2, 22.5, 6)] };
    expect(resumoUltimaVez(ultima)).toBe("Última vez: 22,5 kg × 8");
    expect(resumoUltimaVez({ sessao, series: [serie(1, 40, 10)] })).toBe("Última vez: 40 kg × 10");
  });

  it("nunca feito: nada", () => {
    expect(resumoUltimaVez(null)).toBeNull();
    expect(resumoUltimaVez({ sessao, series: [] })).toBeNull();
  });
});
