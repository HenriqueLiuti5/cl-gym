// Formatação e leitura de números e datas em português.

/** Número de texto do campo para número (vírgula ou ponto), ou null se vazio/inválido. */
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export function formatarKg(kg: number): string {
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
}

export function formatarData(iso: string, opcoes?: Intl.DateTimeFormatOptions): string {
  const data = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return data.toLocaleDateString("pt-BR", opcoes ?? { day: "2-digit", month: "2-digit" });
}

export function haQuantoTempo(iso: string): string {
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}
