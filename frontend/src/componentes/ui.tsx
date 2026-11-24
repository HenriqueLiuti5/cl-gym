import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variante = "principal" | "secundario" | "perigo" | "fantasma";

const VARIANTES: Record<Variante, string> = {
  principal: "bg-emerald-500 text-slate-950 active:bg-emerald-400 font-semibold",
  secundario: "bg-slate-800 text-slate-100 active:bg-slate-700",
  perigo: "bg-rose-600 text-white active:bg-rose-500 font-semibold",
  fantasma: "text-slate-300 active:bg-slate-800",
};

export function Botao({
  variante = "secundario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      type="button"
      className={`rounded-xl px-4 py-3 text-base disabled:opacity-40 ${VARIANTES[variante]} ${className}`}
      {...props}
    />
  );
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-slate-900 p-4 ${className}`}>{children}</div>;
}

export function Titulo({ children, voltar }: { children: ReactNode; voltar?: string }) {
  return (
    <header className="mb-4 flex items-center gap-2">
      {voltar !== undefined && (
        <a href={voltar} className="-ml-2 rounded-lg px-2 py-1 text-2xl text-slate-400" aria-label="Voltar">
          ‹
        </a>
      )}
      <h1 className="text-2xl font-bold">{children}</h1>
    </header>
  );
}

export function Campo({
  rotulo,
  children,
  dica,
}: {
  rotulo: string;
  children: ReactNode;
  dica?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-400">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-slate-500">{dica}</span>}
    </label>
  );
}

export const estiloEntrada =
  "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-lg outline-none focus:border-emerald-400";

export function Aviso({ tipo, children }: { tipo: "info" | "bom" | "ruim"; children: ReactNode }) {
  const cores = {
    info: "bg-slate-800 text-slate-200",
    bom: "bg-emerald-950 text-emerald-300",
    ruim: "bg-amber-950 text-amber-300",
  };
  return <p className={`rounded-xl px-3 py-2 text-sm ${cores[tipo]}`}>{children}</p>;
}
