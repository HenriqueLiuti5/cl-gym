import { describe, expect, it } from "vitest";

import { chaveDaRota, comResistencia, deveTrocar, mesmaTela, sentidoDaTransicao, telaVizinha } from "./navegacao";

const rota = (hash: string) => hash.split("/").filter(Boolean);

describe("chaveDaRota", () => {
  it("põe a parte padrão quando o endereço não diz qual é", () => {
    expect(chaveDaRota(rota("graficos"))).toBe("graficos/treino");
    expect(chaveDaRota(rota("graficos/xyz"))).toBe("graficos/treino");
    expect(chaveDaRota(rota("admin"))).toBe("admin/usuarios");
  });

  it("ignora o id da ficha e do treino", () => {
    expect(chaveDaRota(rota("ficha/abc"))).toBe("ficha");
    expect(chaveDaRota(rota("treino/abc"))).toBe("treino");
    expect(chaveDaRota([])).toBe("");
  });
});

describe("telaVizinha", () => {
  it("anda pelas abas de baixo", () => {
    expect(telaVizinha([], 1)).toBe("dia");
    expect(telaVizinha(rota("dia"), -1)).toBe("");
    expect(telaVizinha([], -1)).toBeNull();
    expect(telaVizinha(rota("conta"), 1)).toBeNull();
  });

  it("passa pelas partes da Evolução antes de ir para a Conta", () => {
    expect(telaVizinha(rota("dia"), 1)).toBe("graficos/treino");
    expect(telaVizinha(rota("graficos"), 1)).toBe("graficos/corpo");
    expect(telaVizinha(rota("graficos/treino"), -1)).toBe("dia");
    expect(telaVizinha(rota("graficos/curiosidades"), 1)).toBe("conta");
    expect(telaVizinha(rota("conta"), -1)).toBe("graficos/curiosidades");
  });

  it("troca as partes da administração sem sair dela", () => {
    expect(telaVizinha(rota("admin"), 1)).toBe("admin/convites");
    expect(telaVizinha(rota("admin/convites"), 1)).toBeNull();
    expect(telaVizinha(rota("admin/usuarios"), -1)).toBeNull();
  });

  it("não arrasta nas telas internas", () => {
    expect(telaVizinha(rota("ficha/abc"), 1)).toBeNull();
    expect(telaVizinha(rota("treino/abc"), -1)).toBeNull();
  });
});

describe("sentidoDaTransicao", () => {
  it("entra pela direita ao avançar nas abas e pela esquerda ao voltar", () => {
    expect(sentidoDaTransicao([], rota("conta"))).toBe(1);
    expect(sentidoDaTransicao(rota("conta"), rota("dia"))).toBe(-1);
    expect(sentidoDaTransicao(rota("graficos/corpo"), rota("graficos/treino"))).toBe(-1);
  });

  it("tela interna entra pela direita e, ao sair, a aba volta pela esquerda", () => {
    expect(sentidoDaTransicao([], rota("ficha/abc"))).toBe(1);
    expect(sentidoDaTransicao(rota("ficha/abc"), rota("treino/x"))).toBe(1);
    expect(sentidoDaTransicao(rota("treino/x"), [])).toBe(-1);
    expect(sentidoDaTransicao(rota("admin/convites"), rota("conta"))).toBe(-1);
  });

  it("não desliza quando a tela é a mesma", () => {
    expect(sentidoDaTransicao(rota("graficos"), rota("graficos/treino"))).toBe(0);
    expect(sentidoDaTransicao(rota("ficha/a"), rota("ficha/b"))).toBe(0);
  });
});

describe("mesmaTela", () => {
  it("compara só a tela, não a parte", () => {
    expect(mesmaTela(rota("graficos/corpo"), rota("graficos/nutricao"))).toBe(true);
    expect(mesmaTela(rota("graficos/curiosidades"), rota("conta"))).toBe(false);
    expect(mesmaTela([], rota("dia"))).toBe(false);
  });
});

describe("deveTrocar", () => {
  it("troca ao passar de um quarto da largura", () => {
    expect(deveTrocar(-110, 400, 0)).toBe(true);
    expect(deveTrocar(90, 400, 0)).toBe(false);
  });

  it("troca num movimento rápido, mesmo curto, se for no mesmo sentido", () => {
    expect(deveTrocar(-60, 400, -0.8)).toBe(true);
    expect(deveTrocar(-60, 400, 0.8)).toBe(false);
    expect(deveTrocar(-30, 400, -2)).toBe(false);
  });
});

describe("comResistencia", () => {
  it("anda menos que o dedo", () => {
    expect(comResistencia(100)).toBe(25);
    expect(comResistencia(-40)).toBe(-10);
  });
});
