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
  // Botão de compartilhar do iPhone (caixa com seta para cima).
  compartilhar: <path d="M8.5 9H7a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17 9h-1.5M12 3.5V14M8.75 6.75 12 3.5l3.25 3.25" />,
  // "Adicionar à Tela de Início" do iPhone (mais dentro de um quadrado).
  adicionarTela: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  // Menu de três pontos do Chrome no Android.
  menuPontos: (
    <>
      <circle cx="12" cy="5.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.25" fill="currentColor" stroke="none" />
    </>
  ),
  instalar: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
  copiar: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  link: <path d="M10 14a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66L11.5 6.84M14 10a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 0 0 5.66 5.66l1.33-1.33" />,
  convite: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  pessoas: (
    <>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M3.25 19c.75-3.25 3-5 5.75-5s5 1.75 5.75 5M15.5 5.6a3.25 3.25 0 0 1 0 5.8M17.5 14.3c1.6.6 2.8 2.2 3.25 4.7" />
    </>
  ),
  // Área de administração.
  escudo: (
    <>
      <path d="M12 3.5 5.5 6v5.5c0 4 2.8 7.3 6.5 9 3.7-1.7 6.5-5 6.5-9V6z" />
      <path d="M9.25 12.25l2 2 3.5-3.75" />
    </>
  ),
  cadeado: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  lixeira: <path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 12.5h9l1-12.5M10 10.5v6M14 10.5v6" />,
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
