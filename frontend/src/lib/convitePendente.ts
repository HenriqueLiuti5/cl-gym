// Convite já conferido, esperando o login com o Google. Fica no localStorage para sobreviver a
// recarregar a página e, no Android, para o app instalado enxergar (ele divide os dados com o
// Chrome). No iPhone o app instalado não vê o que ficou no Safari: lá a pessoa digita o código de
// novo em "Tenho um convite".

const CHAVE = "clgym.convite";

export interface ConvitePendente {
  /** Código sem hífen (normalizado). */
  codigo: string;
  /** Até quando o convite vale (ISO). */
  expira_em: string;
}

export function guardarConvitePendente(convite: ConvitePendente): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(convite));
  } catch {
    // sem armazenamento (navegação privada): vale só enquanto a tela estiver aberta
  }
}

export function apagarConvitePendente(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // nada guardado
  }
}

/** O convite guardado, se ainda valer; um vencido ou estragado é apagado. */
export function lerConvitePendente(agora: number = Date.now()): ConvitePendente | null {
  let texto: string | null;
  try {
    texto = localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
  if (!texto) return null;
  try {
    const dados = JSON.parse(texto) as Partial<ConvitePendente>;
    const expira = typeof dados.expira_em === "string" ? Date.parse(dados.expira_em) : Number.NaN;
    if (typeof dados.codigo === "string" && dados.codigo && expira > agora) {
      return { codigo: dados.codigo, expira_em: dados.expira_em! };
    }
  } catch {
    // JSON estragado: cai no apagar abaixo
  }
  apagarConvitePendente();
  return null;
}
