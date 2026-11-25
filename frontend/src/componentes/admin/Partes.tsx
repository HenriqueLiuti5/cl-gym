// Peças comuns das telas de administração.

import type { ReactNode } from "react";

import { formatarHora } from "../../lib/formato";
import { Icone } from "../icones";
import { Aviso, Botao } from "../ui";

/** "Atualizado às 18:42" e o botão de atualizar (a lista não muda sozinha enquanto está aberta). */
export function BarraAtualizar({
  quando,
  carregando,
  atualizar,
}: {
  quando?: number;
  carregando: boolean;
  atualizar: () => void;
}) {
  return (
    <div className="mb-3 flex min-h-9 items-center justify-between gap-3 px-1">
      <p className="text-[13px] text-texto-3" aria-live="polite">
        {carregando ? "Atualizando…" : quando ? `Atualizado às ${formatarHora(new Date(quando).toISOString())}` : ""}
      </p>
      <Botao variante="fantasma" tamanho="pequeno" className="-mr-2" disabled={carregando} onClick={atualizar}>
        <Icone nome="sincronizar" className={`h-4.5 w-4.5 ${carregando ? "animate-spin" : ""}`} />
        Atualizar
      </Botao>
    </div>
  );
}

/** Primeira carga (ainda sem nada para mostrar) ou erro, com "Tentar de novo". */
export function SemDados({ erro, tentar }: { erro?: string; tentar: () => void }) {
  if (!erro) return <p className="py-10 text-center text-[15px] text-texto-3">Carregando…</p>;
  return (
    <div className="space-y-3">
      <Aviso tipo="erro">{erro}</Aviso>
      <Botao className="w-full" onClick={tentar}>
        Tentar de novo
      </Botao>
    </div>
  );
}

/** Círculo com a inicial do nome (como o da aba Conta). */
export function Avatar({ nome, tamanho = "h-10 w-10 text-[17px]" }: { nome: string; tamanho?: string }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-campo font-semibold text-texto-2 ${tamanho}`}>
      {Array.from(nome)[0]?.toUpperCase()}
    </span>
  );
}

/** Linha "rótulo — valor" das janelas de detalhe. */
export function Info({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-linha py-2.5 last:border-b-0">
      <dt className="shrink-0 text-[15px] text-texto-2">{rotulo}</dt>
      <dd className="min-w-0 text-right text-[15px] break-words">{children}</dd>
    </div>
  );
}

/** Lista agrupada (como o Grupo de ui.tsx) com o fio entre as linhas começando depois do avatar. */
export function ListaComAvatar({ titulo, rodape, children }: { titulo?: ReactNode; rodape?: ReactNode; children: ReactNode }) {
  return (
    <section>
      {titulo && <h2 className="mb-1.5 px-4 text-[13px] font-semibold text-texto-2">{titulo}</h2>}
      <div className="overflow-hidden rounded-xl bg-superficie [&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:top-0 [&>*+*]:before:right-0 [&>*+*]:before:left-[4.25rem] [&>*+*]:before:h-px [&>*+*]:before:bg-linha">
        {children}
      </div>
      {rodape && <p className="mt-1.5 px-4 text-[13px] leading-snug text-texto-3">{rodape}</p>}
    </section>
  );
}
