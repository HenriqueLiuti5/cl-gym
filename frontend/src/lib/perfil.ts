// Perfil: nome, peso, altura e idade atuais. Os limites são os do servidor (Perfil e
// RegistroDiario em backend/models.py), para nada ser recusado na hora de salvar.

import { lerNumero } from "./formato";
import type { RegistroDiario, Usuario } from "./tipos";

export const LIMITES = {
  nome: 200,
  pesoMax: 500,
  altura: { min: 50, max: 250 },
  idade: { min: 10, max: 120 },
} as const;

export interface CamposPerfil {
  nome: string;
  peso: string;
  altura: string;
  idade: string;
}

export interface DadosPerfil {
  nome: string;
  peso_kg: number;
  altura_cm: number;
  idade: number;
}

/** O app pede o perfil (no primeiro acesso) enquanto faltar nome, altura ou idade. */
export function perfilIncompleto(usuario: Usuario): boolean {
  return !usuario.nome?.trim() || usuario.altura_cm == null || usuario.idade == null;
}

/** Altura em cm, inteira. Aceita também em metros: "1,75" vira 175. */
export function lerAltura(texto: string): number | null {
  const n = lerNumero(texto);
  if (n === null) return null;
  return Math.round(n < 3 ? n * 100 : n);
}

/** Confere o formulário: devolve os dados prontos ou a mensagem do primeiro problema. */
export function lerPerfil(campos: CamposPerfil): { dados: DadosPerfil } | { erro: string } {
  const nome = campos.nome.trim();
  if (!nome) return { erro: "Coloque seu nome." };
  if (nome.length > LIMITES.nome) return { erro: "O nome está comprido demais." };

  const peso = lerNumero(campos.peso);
  if (peso === null || peso <= 0 || peso > LIMITES.pesoMax) {
    return { erro: "Confira o peso, em kg (ex.: 78,4)." };
  }
  const altura = lerAltura(campos.altura);
  if (altura === null || altura < LIMITES.altura.min || altura > LIMITES.altura.max) {
    return { erro: "Confira a altura, em cm (ex.: 175)." };
  }
  const idade = lerNumero(campos.idade);
  if (idade === null || !Number.isInteger(idade) || idade < LIMITES.idade.min || idade > LIMITES.idade.max) {
    return { erro: "Confira a idade, em anos." };
  }
  return { dados: { nome, peso_kg: peso, altura_cm: altura, idade } };
}

/** Peso atual: o último lançado no registro do dia. */
export function pesoAtual(registros: RegistroDiario[]): { peso: number; data: string } | null {
  let ultimo: RegistroDiario | undefined;
  for (const r of registros) {
    if (r.excluido || r.peso_kg === null) continue;
    if (!ultimo || r.data > ultimo.data) ultimo = r;
  }
  return ultimo ? { peso: ultimo.peso_kg!, data: ultimo.data } : null;
}
