// Ícones do app: traço simples em 24×24, na cor do texto em volta (currentColor).
// Desenhados aqui para não depender de biblioteca; o app não usa emojis.

import type { ReactNode, SVGProps } from "react";

const DESENHOS = {
  halter: (
    <>
      <rect x="5" y="6.5" width="3" height="11" rx="1" />
      <rect x="16" y="6.5" width="3" height="11" rx="1" />
      <path d="M2.75 9.75v4.5M21.25 9.75v4.5M2.75 12H5M19 12h2.25M8 12h8" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  grafico: <path d="M4 4v16h16M7.5 15l3.5-4.5 3 2.5 4.5-6" />,
  pessoa: (
    <>
      <circle cx="12" cy="8.25" r="3.75" />
      <path d="M4.75 20c.9-3.75 3.75-5.75 7.25-5.75s6.35 2 7.25 5.75" />
    </>
  ),
  voltar: <path d="M15 5l-7 7 7 7" />,
  avancar: <path d="M9 5l7 7-7 7" />,
  abaixo: <path d="M6 9l6 6 6-6" />,
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  mais: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  subir: <path d="M12 19V5M6 11l6-6 6 6" />,
  descer: <path d="M12 5v14M6 13l6 6 6-6" />,
  trocar: <path d="M4 8h14M14.5 4.5L18 8l-3.5 3.5M20 16H6M9.5 12.5L6 16l3.5 3.5" />,
  sincronizar: <path d="M19.5 12a7.5 7.5 0 0 1-13.4 4.6M4.5 12a7.5 7.5 0 0 1 13.4-4.6M18.5 3.75v3.9h-3.9M5.5 20.25v-3.9h3.9" />,
  alvo: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="12" cy="12" r="0.75" fill="currentColor" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.25" />
      <circle cx="12" cy="7.9" r="0.6" fill="currentColor" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 4.5l8.5 15h-17z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.75" r="0.6" fill="currentColor" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type NomeIcone = keyof typeof DESENHOS;

export function Icone({ nome, className = "h-5 w-5", ...props }: { nome: NomeIcone } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      className={`shrink-0 ${className}`}
      {...props}
    >
      {DESENHOS[nome]}
    </svg>
  );
}
