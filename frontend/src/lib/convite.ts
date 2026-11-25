// Código do convite: 8 letras e números, sem os que se confundem (0/O, 1/I/L). O servidor usa o
// mesmo alfabeto (backend/convites.py). Guardado sem hífen e mostrado como "7KQM-X4PD".

export const ALFABETO_CONVITE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const TAMANHO_CODIGO = 8;

export type SituacaoConvite = "valido" | "expirado" | "usado" | "cancelado";

/**
 * O que a pessoa digitou ou colou → só letras e números, em maiúsculas ("7kqm x4pd" → "7KQMX4PD").
 * Se colar a mensagem inteira ("Código do convite: 7KQM-X4PD..."), pega só o código.
 */
export function normalizarCodigo(texto: string): string {
  const maiusculo = texto.toUpperCase();
  const achado = /(?:^|[^A-Z0-9])([A-Z0-9]{4})-([A-Z0-9]{4})(?![A-Z0-9])/.exec(maiusculo);
  if (achado) return `${achado[1]}${achado[2]}`;
  return maiusculo.replace(/[^A-Z0-9]/g, "").slice(0, TAMANHO_CODIGO);
}

/** Com o hífen no meio, também no meio da digitação: "7KQMX" → "7KQM-X". */
export function formatarCodigo(texto: string): string {
  const codigo = normalizarCodigo(texto);
  return codigo.length > 4 ? `${codigo.slice(0, 4)}-${codigo.slice(4)}` : codigo;
}

/** Tem os 8 caracteres, todos do alfabeto. */
export function codigoCompleto(texto: string): boolean {
  const codigo = normalizarCodigo(texto);
  return codigo.length === TAMANHO_CODIGO && [...codigo].every((c) => ALFABETO_CONVITE.includes(c));
}

/** Link que o admin manda: abre a tela do convite, onde a pessoa digita o código. */
export function linkDoConvite(id: string, origem: string = window.location.origin): string {
  return `${origem}/#/convite/${id}`;
}

/** Frase para quem recebeu o convite, quando ele não serve mais. */
export function mensagemSituacao(situacao: Exclude<SituacaoConvite, "valido">): string {
  return {
    expirado: "Este convite expirou. Peça outro.",
    usado: "Este convite já foi usado.",
    cancelado: "Este convite foi cancelado.",
  }[situacao];
}

/** Até quando vale, no fuso do aparelho: "hoje, 18:42", "amanhã, 18:42" ou "27/11, 18:42". */
export function quandoVence(expiraEm: string, agora: Date = new Date()): string {
  const fim = new Date(expiraEm);
  const hora = fim.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Arredondado: na troca do horário de verão um dia tem 23 ou 25 horas.
  const dias = Math.round((dia(fim) - dia(agora)) / 86_400_000);
  if (dias === 0) return `hoje, ${hora}`;
  if (dias === 1) return `amanhã, ${hora}`;
  return `${fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${hora}`;
}
