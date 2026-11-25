import { describe, expect, it } from "vitest";

import {
  ativoAgora,
  diasAtras,
  faltaParaExpirar,
  ordenarUsuarios,
  resumirUsuarios,
  rotuloAparelho,
  separarConvites,
  situacaoAtual,
  tempoRelativo,
  textoHistorico,
  textoVisto,
  valeAte,
  type ConviteAdmin,
  type UsuarioAdmin,
} from "./admin";

// Datas no fuso do aparelho (o teste passa em qualquer fuso): 25/11/2026, 18:00.
const AGORA = new Date(2026, 10, 25, 18, 0).getTime();
const em = (dia: number, hora: number, minuto = 0) => new Date(2026, 10, dia, hora, minuto).toISOString();
const minutosAtras = (m: number) => new Date(AGORA - m * 60_000).toISOString();

const usuario = (id: string, campos: Partial<UsuarioAdmin> = {}): UsuarioAdmin => ({
  id,
  nome: id,
  email: `${id}@exemplo.com`,
  criado_em: em(1, 10),
  visto_em: null,
  aparelho: null,
  instalado: false,
  bloqueado: false,
  bloqueado_em: null,
  admin: false,
  treinos: 0,
  treinos_30d: 0,
  ultimo_treino: null,
  ...campos,
});

const convite = (id: string, campos: Partial<ConviteAdmin> = {}): ConviteAdmin => ({
  id,
  codigo: "7KQM-X4PD",
  situacao: "valido",
  criado_em: em(25, 10),
  expira_em: em(26, 10),
  usado_em: null,
  cancelado_em: null,
  usado_por: null,
  ...campos,
});

describe("tempo relativo", () => {
  it("minutos e horas de hoje", () => {
    expect(tempoRelativo(minutosAtras(0.5), AGORA)).toBe("agora há pouco");
    expect(tempoRelativo(minutosAtras(25), AGORA)).toBe("há 25 min");
    expect(tempoRelativo(em(25, 15, 0), AGORA)).toBe("há 3 h");
  });

  it("ontem e dias atrás pelo calendário, não por 24 h", () => {
    // 22h de ontem, 20 h atrás: já é "ontem".
    expect(tempoRelativo(em(24, 22), AGORA)).toBe("ontem");
    expect(tempoRelativo(em(21, 9), AGORA)).toBe("há 4 dias");
    expect(tempoRelativo(new Date(2026, 9, 12, 9).toISOString(), AGORA)).toBe("em 12/10");
    expect(tempoRelativo(new Date(2025, 9, 12, 9).toISOString(), AGORA)).toBe("em 12/10/2025");
  });

  it("logo depois da meia-noite, poucos minutos ainda contam em minutos", () => {
    const madrugada = new Date(2026, 10, 26, 0, 10).getTime();
    expect(tempoRelativo(em(25, 23, 50), madrugada)).toBe("há 20 min");
    expect(diasAtras(em(25, 23, 50), madrugada)).toBe(1);
  });
});

describe("usuários", () => {
  it("ativo agora é visto há menos de 10 minutos", () => {
    expect(ativoAgora(minutosAtras(9), AGORA)).toBe(true);
    expect(ativoAgora(minutosAtras(11), AGORA)).toBe(false);
    expect(ativoAgora(null, AGORA)).toBe(false);
  });

  it("texto da situação na lista", () => {
    expect(textoVisto(minutosAtras(2), AGORA)).toBe("Ativo agora");
    expect(textoVisto(em(25, 15), AGORA)).toBe("Visto há 3 h");
    expect(textoVisto(em(24, 9), AGORA)).toBe("Visto ontem");
    expect(textoVisto(null, AGORA)).toBe("Nunca abriu");
  });

  it("aparelho e se usa o app instalado", () => {
    expect(rotuloAparelho({ aparelho: "iPhone", instalado: true })).toBe("iPhone · app instalado");
    expect(rotuloAparelho({ aparelho: "Android", instalado: false })).toBe("Android · no navegador");
    expect(rotuloAparelho({ aparelho: null, instalado: false })).toBeNull();
  });

  it("ordena pelo visto mais recente, com quem nunca abriu no fim", () => {
    const lista = [
      usuario("bia"),
      usuario("caio", { visto_em: em(24, 9) }),
      usuario("ana", { visto_em: em(25, 17) }),
      usuario("aldo"),
    ];
    expect(ordenarUsuarios(lista).map((u) => u.id)).toEqual(["ana", "caio", "aldo", "bia"]);
  });

  it("resumo: pessoas, quem usou hoje, treinos do mês e bloqueados", () => {
    const resumo = resumirUsuarios(
      [
        usuario("ana", { visto_em: em(25, 8), treinos_30d: 6 }),
        usuario("bia", { visto_em: em(24, 23), treinos_30d: 2, bloqueado: true }),
        usuario("caio", { treinos_30d: 0 }),
      ],
      AGORA,
    );
    expect(resumo).toEqual({ pessoas: 3, usaramHoje: 1, treinos30d: 8, bloqueados: 1 });
  });
});

describe("convites", () => {
  it("quanto falta para expirar", () => {
    expect(faltaParaExpirar(new Date(AGORA + 24 * 3_600_000 - 1000).toISOString(), AGORA)).toBe("Expira em 24 h");
    expect(faltaParaExpirar(new Date(AGORA + 40 * 60_000).toISOString(), AGORA)).toBe("Expira em 40 min");
    expect(faltaParaExpirar(new Date(AGORA + 20_000).toISOString(), AGORA)).toBe("Expira em menos de 1 min");
    expect(faltaParaExpirar(new Date(AGORA - 1000).toISOString(), AGORA)).toBe("Expirou");
  });

  it("vale até hoje, amanhã ou uma data", () => {
    expect(valeAte(em(25, 22, 30), AGORA)).toBe("Vale até hoje, 22:30");
    expect(valeAte(em(26, 18, 0), AGORA)).toBe("Vale até amanhã, 18:00");
    expect(valeAte(em(28, 9, 5), AGORA)).toBe("Vale até 28/11, 09:05");
  });

  it("um válido que passou da hora com a tela aberta já conta como expirado", () => {
    expect(situacaoAtual(convite("a", { expira_em: em(25, 17) }), AGORA)).toBe("expirado");
    expect(situacaoAtual(convite("b"), AGORA)).toBe("valido");
    expect(situacaoAtual(convite("c", { situacao: "usado", expira_em: em(25, 17) }), AGORA)).toBe("usado");
  });

  it("separa os válidos (mais novos primeiro) do histórico (o que acabou por último primeiro)", () => {
    const { validos, historico } = separarConvites(
      [
        convite("velho", { criado_em: em(25, 9) }),
        convite("novo", { criado_em: em(25, 17) }),
        convite("usado", { situacao: "usado", codigo: null, usado_em: em(25, 12) }),
        convite("cancelado", { situacao: "cancelado", codigo: null, cancelado_em: em(24, 8) }),
        convite("venceu-agora", { criado_em: em(24, 17, 30), expira_em: em(25, 17, 30) }),
      ],
      AGORA,
    );
    expect(validos.map((c) => c.id)).toEqual(["novo", "velho"]);
    expect(historico.map((c) => c.id)).toEqual(["venceu-agora", "usado", "cancelado"]);
  });

  it("textos do histórico", () => {
    const pessoa = { id: "u1", nome: "Ana", email: "ana@exemplo.com" };
    expect(textoHistorico(convite("a", { situacao: "usado", usado_em: em(25, 12), usado_por: pessoa }), AGORA)).toBe(
      "Usado por Ana em 25/11",
    );
    expect(textoHistorico(convite("b", { situacao: "usado", usado_em: em(25, 12) }), AGORA)).toBe(
      "Usado em 25/11 · conta apagada depois",
    );
    expect(textoHistorico(convite("c", { situacao: "cancelado", cancelado_em: em(24, 8) }), AGORA)).toBe(
      "Cancelado em 24/11",
    );
    expect(textoHistorico(convite("d", { situacao: "expirado", expira_em: em(23, 8) }), AGORA)).toBe("Expirou em 23/11");
  });
});
