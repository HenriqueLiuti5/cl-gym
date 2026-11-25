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

/** Hora do dia: "18:42". */
export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function haQuantoTempo(iso: string): string {
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/** Número em português, com até `casas` decimais (1.234,5). */
export function formatarNumero(n: number, casas = 1): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/** Mililitros como litros: 2650 → "2,7 L". */
export function formatarLitros(ml: number): string {
  return `${formatarNumero(ml / 1000)} L`;
}

/** Peso grande: até 1 t em kg, depois em toneladas (182 t, 12,3 t). */
export function formatarTonelada(kg: number): string {
  if (kg < 1000) return `${formatarNumero(Math.round(kg), 0)} kg`;
  return `${formatarNumero(kg / 1000, kg < 100_000 ? 1 : 0)} t`;
}

/** Minutos: "58 min", "1 h 05", "61 h". */
export function formatarDuracao(minutos: number): string {
  const total = Math.round(minutos);
  if (total < 60) return `${total} min`;
  const horas = Math.floor(total / 60);
  if (horas >= 10) return `${formatarNumero(horas, 0)} h`;
  return `${horas} h ${String(total % 60).padStart(2, "0")}`;
}

/** Diferença com sinal: "+2,5 kg", "−0,3 kg" (sinal de menos de verdade). */
export function formatarVariacao(n: number, unidade: string, casas = 1): string {
  const texto = formatarNumero(Math.abs(n), casas);
  const sinal = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sinal}${texto}${unidade ? ` ${unidade}` : ""}`;
}
