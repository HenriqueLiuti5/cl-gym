import { describe, expect, it } from "vitest";

import { lerAltura, lerPerfil, perfilIncompleto, pesoAtual } from "./perfil";
import type { RegistroDiario, Usuario } from "./tipos";

const usuario = (campos: Partial<Usuario> = {}): Usuario => ({
  id: "u1",
  email: "ana@exemplo.com",
  nome: "Ana",
  criado_em: "2026-11-01T00:00:00Z",
  altura_cm: 165,
  idade: 29,
  ...campos,
});

const registro = (data: string, peso_kg: number | null, excluido = false): RegistroDiario => ({
  id: data,
  atualizado_em: `${data}T08:00:00Z`,
  excluido,
  data,
  peso_kg,
  kcal: null,
  proteina_g: null,
  observacao: null,
});

const campos = { nome: " Ana ", peso: "61,5", altura: "165", idade: "29" };

describe("perfilIncompleto", () => {
  it("só libera o app com nome, altura e idade", () => {
    expect(perfilIncompleto(usuario())).toBe(false);
    expect(perfilIncompleto(usuario({ nome: null }))).toBe(true);
    expect(perfilIncompleto(usuario({ nome: "  " }))).toBe(true);
    expect(perfilIncompleto(usuario({ altura_cm: null }))).toBe(true);
    expect(perfilIncompleto(usuario({ idade: null }))).toBe(true);
  });

  it("trata como incompleto o usuário guardado antes de existir o perfil", () => {
    const antigo = usuario();
    delete (antigo as Partial<Usuario>).altura_cm;
    expect(perfilIncompleto(antigo)).toBe(true);
  });
});

describe("lerAltura", () => {
  it("aceita cm ou metros", () => {
    expect(lerAltura("175")).toBe(175);
    expect(lerAltura("1,75")).toBe(175);
    expect(lerAltura("1.8")).toBe(180);
    expect(lerAltura("")).toBeNull();
    expect(lerAltura("alto")).toBeNull();
  });
});

describe("lerPerfil", () => {
  it("devolve os dados com o nome sem espaços nas pontas", () => {
    expect(lerPerfil(campos)).toEqual({
      dados: { nome: "Ana", peso_kg: 61.5, altura_cm: 165, idade: 29 },
    });
  });

  it("recusa o que o servidor recusaria", () => {
    const erros = [
      { nome: "" },
      { nome: "x".repeat(201) },
      { peso: "" },
      { peso: "0" },
      { peso: "501" },
      { altura: "49" },
      { altura: "251" },
      { idade: "9" },
      { idade: "121" },
      { idade: "29,5" },
    ];
    for (const mudanca of erros) {
      expect(lerPerfil({ ...campos, ...mudanca }), JSON.stringify(mudanca)).toHaveProperty("erro");
    }
  });
});

describe("pesoAtual", () => {
  it("é o último peso lançado, ignorando dias sem peso e excluídos", () => {
    const registros = [
      registro("2026-11-20", 80),
      registro("2026-11-23", 79.4),
      registro("2026-11-24", null),
      registro("2026-11-25", 70, true),
      registro("2026-11-21", 79.8),
    ];
    expect(pesoAtual(registros)).toEqual({ peso: 79.4, data: "2026-11-23" });
    expect(pesoAtual([registro("2026-11-24", null)])).toBeNull();
  });
});
