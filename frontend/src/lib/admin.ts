// Área de administração (só a conta do ADMIN_EMAIL consegue usar as rotas de /api/admin).
// Mostra só atividade: quando a pessoa usou o app, em que aparelho e quantos treinos fez. Nada de
// peso, alimentação, metas ou cargas (decidido com o Henrique em 25/11/2026).

import { api } from "./api";
import type { SituacaoConvite } from "./convite";
import { formatarData, formatarHora } from "./formato";

export interface UsuarioAdmin {
  id: string;
  nome: string | null;
  email: string;
  criado_em: string;
  /** Última vez que o app falou com o servidor (abrir, sincronizar...). */
  visto_em: string | null;
  /** "iPhone", "iPad", "Android" ou "Computador"; nulo até o primeiro acesso depois da novidade. */
  aparelho: string | null;
  instalado: boolean;
  bloqueado: boolean;
  bloqueado_em: string | null;
  admin: boolean;
  /** Treinos terminados (sem os apagados), no total e nos últimos 30 dias. */
  treinos: number;
  treinos_30d: number;
  ultimo_treino: string | null;
}

export interface ConviteAdmin {
  id: string;
  /** "XXXX-XXXX", só enquanto o convite vale (depois o servidor manda null). */
  codigo: string | null;
  situacao: SituacaoConvite;
  criado_em: string;
  expira_em: string;
  usado_em: string | null;
  cancelado_em: string | null;
  usado_por: { id: string; nome: string | null; email: string } | null;
}

// --- Chamadas (precisam de internet) --------------------------------------------------------

export const listarUsuarios = () => api<UsuarioAdmin[]>("/admin/usuarios");
export const bloquearUsuario = (id: string) =>
  api<UsuarioAdmin>(`/admin/usuarios/${id}/bloquear`, { metodo: "POST" });
export const desbloquearUsuario = (id: string) =>
  api<UsuarioAdmin>(`/admin/usuarios/${id}/desbloquear`, { metodo: "POST" });
export const excluirUsuario = (id: string) => api<void>(`/admin/usuarios/${id}`, { metodo: "DELETE" });

export const listarConvites = () => api<ConviteAdmin[]>("/admin/convites");
export const gerarConvite = () => api<ConviteAdmin>("/admin/convites", { metodo: "POST" });
export const cancelarConvite = (id: string) =>
  api<ConviteAdmin>(`/admin/convites/${id}/cancelar`, { metodo: "POST" });

// --- Tempo ----------------------------------------------------------------------------------

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
/** Visto há menos que isto conta como "ativo agora" (o app fala com o servidor ao abrir). */
export const ATIVO_MS = 10 * MINUTO;

export function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
}

/** Dias de calendário, no fuso do aparelho, entre a data e `agora`: 0 = hoje, 1 = ontem, -1 = amanhã. */
export function diasAtras(iso: string, agora: number): number {
  const meiaNoite = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((meiaNoite(new Date(agora)) - meiaNoite(new Date(iso))) / 86_400_000);
}

/** "25/11" (ou "25/11/2025", se for de outro ano). */
export function dataCurta(iso: string, agora: number): string {
  const outroAno = new Date(iso).getFullYear() !== new Date(agora).getFullYear();
  return formatarData(iso, outroAno ? { day: "2-digit", month: "2-digit", year: "numeric" } : undefined);
}

/** "25/11 às 18:42". */
export function dataEHora(iso: string, agora: number): string {
  return `${dataCurta(iso, agora)} às ${formatarHora(iso)}`;
}

/** "agora há pouco", "há 25 min", "há 3 h", "ontem", "há 4 dias" ou "em 12/10". */
export function tempoRelativo(iso: string, agora: number): string {
  const passou = agora - Date.parse(iso);
  if (passou < MINUTO) return "agora há pouco";
  if (passou < HORA) return `há ${Math.floor(passou / MINUTO)} min`;
  const dias = diasAtras(iso, agora);
  if (dias <= 0) return `há ${Math.floor(passou / HORA)} h`;
  if (dias === 1) return "ontem";
  if (dias <= 30) return `há ${dias} dias`;
  return `em ${dataCurta(iso, agora)}`;
}

// --- Usuários -------------------------------------------------------------------------------

export function nomeDe(u: { nome: string | null; email: string }): string {
  return u.nome?.trim() || u.email;
}

export function ativoAgora(vistoEm: string | null, agora: number): boolean {
  return vistoEm !== null && agora - Date.parse(vistoEm) < ATIVO_MS;
}

/** Situação na lista: "Ativo agora", "Visto há 3 h", "Visto ontem"... ou "Nunca abriu". */
export function textoVisto(vistoEm: string | null, agora: number): string {
  if (vistoEm === null) return "Nunca abriu";
  if (ativoAgora(vistoEm, agora)) return "Ativo agora";
  return `Visto ${tempoRelativo(vistoEm, agora)}`;
}

/** "iPhone · app instalado", "Android · no navegador"; null enquanto o servidor não souber. */
export function rotuloAparelho(u: Pick<UsuarioAdmin, "aparelho" | "instalado">): string | null {
  if (!u.aparelho) return null;
  return `${u.aparelho} · ${u.instalado ? "app instalado" : "no navegador"}`;
}

/** Visto mais recentemente primeiro; quem nunca abriu vai para o fim (por nome). */
export function ordenarUsuarios(usuarios: UsuarioAdmin[]): UsuarioAdmin[] {
  return [...usuarios].sort((a, b) => {
    if (a.visto_em !== b.visto_em) {
      if (a.visto_em === null) return 1;
      if (b.visto_em === null) return -1;
      return Date.parse(b.visto_em) - Date.parse(a.visto_em);
    }
    return nomeDe(a).localeCompare(nomeDe(b), "pt-BR");
  });
}

export interface ResumoUsuarios {
  pessoas: number;
  /** Abriram o app hoje (no fuso deste aparelho). */
  usaramHoje: number;
  treinos30d: number;
  bloqueados: number;
}

export function resumirUsuarios(usuarios: UsuarioAdmin[], agora: number): ResumoUsuarios {
  return {
    pessoas: usuarios.length,
    usaramHoje: usuarios.filter((u) => u.visto_em !== null && diasAtras(u.visto_em, agora) <= 0).length,
    treinos30d: usuarios.reduce((soma, u) => soma + u.treinos_30d, 0),
    bloqueados: usuarios.filter((u) => u.bloqueado).length,
  };
}

// --- Convites -------------------------------------------------------------------------------

/** A situação agora: um convite "válido" que passou da hora com a tela aberta já expirou. */
export function situacaoAtual(c: ConviteAdmin, agora: number): SituacaoConvite {
  return c.situacao === "valido" && Date.parse(c.expira_em) <= agora ? "expirado" : c.situacao;
}

/** "Expira em 24 h", "Expira em 40 min", "Expira em menos de 1 min". */
export function faltaParaExpirar(expiraEm: string, agora: number): string {
  const falta = Date.parse(expiraEm) - agora;
  if (falta <= 0) return "Expirou";
  if (falta < MINUTO) return "Expira em menos de 1 min";
  if (falta < HORA) return `Expira em ${Math.floor(falta / MINUTO)} min`;
  return `Expira em ${Math.round(falta / HORA)} h`;
}

/** "Vale até hoje, 18:42", "Vale até amanhã, 18:42" ou "Vale até 27/11, 18:42". */
export function valeAte(expiraEm: string, agora: number): string {
  const dias = -diasAtras(expiraEm, agora);
  const dia = dias === 0 ? "hoje" : dias === 1 ? "amanhã" : dataCurta(expiraEm, agora);
  return `Vale até ${dia}, ${formatarHora(expiraEm)}`;
}

/** Quando o convite deixou de valer (usado, cancelado ou expirado). */
function fimDoConvite(c: ConviteAdmin, agora: number): number {
  const situacao = situacaoAtual(c, agora);
  if (situacao === "usado" && c.usado_em) return Date.parse(c.usado_em);
  if (situacao === "cancelado" && c.cancelado_em) return Date.parse(c.cancelado_em);
  return Date.parse(c.expira_em);
}

/** Os que ainda valem (mais novos primeiro) e o histórico (o que acabou por último primeiro). */
export function separarConvites(
  convites: ConviteAdmin[],
  agora: number,
): { validos: ConviteAdmin[]; historico: ConviteAdmin[] } {
  const validos = convites
    .filter((c) => situacaoAtual(c, agora) === "valido")
    .sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em));
  const historico = convites
    .filter((c) => situacaoAtual(c, agora) !== "valido")
    .sort((a, b) => fimDoConvite(b, agora) - fimDoConvite(a, agora));
  return { validos, historico };
}

/** Linha do histórico: "Usado por Ana em 25/11", "Expirou em 26/11", "Cancelado em 25/11". */
export function textoHistorico(c: ConviteAdmin, agora: number): string {
  switch (situacaoAtual(c, agora)) {
    case "usado": {
      const quando = c.usado_em ? ` em ${dataCurta(c.usado_em, agora)}` : "";
      // Sem `usado_por`: a conta criada com ele foi apagada depois.
      return c.usado_por ? `Usado por ${nomeDe(c.usado_por)}${quando}` : `Usado${quando} · conta apagada depois`;
    }
    case "cancelado":
      return `Cancelado em ${dataCurta(c.cancelado_em ?? c.criado_em, agora)}`;
    case "expirado":
      return `Expirou em ${dataCurta(c.expira_em, agora)}`;
    default:
      return valeAte(c.expira_em, agora);
  }
}

/** A mensagem que vai junto com o link (o código o admin manda à parte). */
export function textoDoLink(link: string): string {
  return `Convite para o CL Gym: abra o link e digite o código que eu vou te mandar.\n${link}`;
}
