import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Icone, type NomeIcone } from "./icones";

type Variante = "principal" | "secundario" | "perigo" | "perigoLeve" | "fantasma";

const VARIANTES: Record<Variante, string> = {
  principal: "bg-acento-forte font-semibold text-white active:opacity-85",
  secundario: "bg-campo font-medium text-texto active:opacity-75",
  perigo: "bg-perigo-forte font-semibold text-white active:opacity-85",
  perigoLeve: "font-medium text-perigo active:bg-perigo-suave",
  fantasma: "font-medium text-acento active:bg-acento-suave",
};

const TAMANHOS = {
  normal: "h-12 rounded-xl px-5 text-[17px]",
  pequeno: "h-9 rounded-lg px-3.5 text-[15px]",
};

export function Botao({
  variante = "secundario",
  tamanho = "normal",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamanho?: keyof typeof TAMANHOS }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 disabled:opacity-40 ${TAMANHOS[tamanho]} ${VARIANTES[variante]} ${className}`}
      {...props}
    />
  );
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-superficie p-4 ${className}`}>{children}</div>;
}

/** Título das telas das abas (Treinos, Dia, Evolução, Conta). */
export function Titulo({ children, subtitulo }: { children: ReactNode; subtitulo?: ReactNode }) {
  return (
    <header className="mb-5 pt-1">
      <h1 className="text-[28px] leading-tight font-bold">{children}</h1>
      {subtitulo && <p className="mt-0.5 text-[15px] text-texto-2">{subtitulo}</p>}
    </header>
  );
}

/** Barra fixa no topo das telas internas (ficha, treino): voltar, título e uma ação. */
export function BarraTopo({ titulo, voltar, acao }: { titulo: ReactNode; voltar: string; acao?: ReactNode }) {
  return (
    // data-fixo-na-troca: fica parada ao trocar de parte na mesma tela (administração).
    <header data-fixo-na-troca="barra" className="sticky top-0 z-20 -mx-4 mb-4 flex h-12 items-center gap-1 border-b border-linha bg-fundo px-2">
      {/* data-voltar: arrastar da borda esquerda vai para cá (componentes/Palco.tsx). */}
      <a href={voltar} data-voltar className="grid h-11 w-10 shrink-0 place-items-center rounded-lg text-acento active:bg-campo" aria-label="Voltar">
        <Icone nome="voltar" className="h-6 w-6" />
      </a>
      <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{titulo}</h1>
      {acao && <div className="shrink-0 pr-1">{acao}</div>}
    </header>
  );
}

/** Seção com título pequeno em cima, caixa branca e uma nota embaixo (estilo ajustes do celular). */
export function Grupo({
  titulo,
  rodape,
  children,
  className = "",
}: {
  titulo?: ReactNode;
  rodape?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {titulo && <h2 className="mb-1.5 px-4 text-[13px] font-semibold text-texto-2">{titulo}</h2>}
      <div className="lista overflow-hidden rounded-xl bg-superficie">{children}</div>
      {rodape && <p className="mt-1.5 px-4 text-[13px] leading-snug text-texto-3">{rodape}</p>}
    </section>
  );
}

/** Linha de uma lista: abre um link, chama uma função ou só mostra (sem `href` nem `onClick`). */
export function Linha({
  titulo,
  subtitulo,
  direita,
  href,
  onClick,
  seta = Boolean(href),
  tom = "normal",
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  direita?: ReactNode;
  href?: string;
  onClick?: () => void;
  seta?: boolean;
  tom?: "normal" | "acento" | "perigo";
}) {
  const cor = { normal: "", acento: "text-acento", perigo: "text-perigo" }[tom];
  const miolo = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block text-[17px] ${cor}`}>{titulo}</span>
        {subtitulo && <span className="mt-0.5 block text-[14px] leading-snug text-texto-2">{subtitulo}</span>}
      </span>
      {direita !== undefined && <span className="shrink-0 text-right text-[15px] text-texto-2">{direita}</span>}
      {seta && <Icone nome="avancar" className="-mr-1 h-5 w-5 text-texto-3" />}
    </>
  );
  const classe = "flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left";
  if (href) {
    return (
      <a href={href} className={`${classe} active:bg-campo`}>
        {miolo}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${classe} active:bg-campo`}>
        {miolo}
      </button>
    );
  }
  return <div className={classe}>{miolo}</div>;
}

/** Campo com o rótulo em cima (formulários soltos e janelas). */
export function Campo({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">{rotulo}</span>
      {children}
      {dica && <span className="mt-1.5 block text-[13px] leading-snug text-texto-3">{dica}</span>}
    </label>
  );
}

/** Fonte de 17px: abaixo de 16px o iPhone dá zoom ao tocar no campo. */
export const estiloEntrada =
  "h-12 w-full rounded-lg border border-transparent bg-campo px-3.5 text-[17px] text-texto outline-none placeholder:text-texto-3 focus:border-acento";

/** Campo dentro de uma linha de lista, alinhado à direita (a largura vem de quem usa: w-24...). */
export const estiloEntradaLinha =
  "h-10 rounded-lg border border-transparent bg-campo px-3 text-right text-[17px] text-texto tabular-nums outline-none placeholder:text-texto-3 focus:border-acento";

/** Linha de lista com um campo: rótulo à esquerda, campo e unidade à direita. */
export function LinhaCampo({ rotulo, unidade, dica, children }: { rotulo: string; unidade?: string; dica?: string; children: ReactNode }) {
  return (
    <label className="flex min-h-13 items-center gap-3 py-2 pr-3 pl-4">
      <span className="min-w-0 flex-1">
        <span className="block text-[17px]">{rotulo}</span>
        {dica && <span className="block text-[13px] text-texto-3">{dica}</span>}
      </span>
      {children}
      {unidade !== undefined && <span className="w-10 shrink-0 text-[15px] text-texto-2">{unidade}</span>}
    </label>
  );
}

/** Opções lado a lado, uma escolhida (abas da Evolução, período dos gráficos). */
export function Segmentos({
  opcoes,
  escolhido,
  escolher,
  link,
  rotulo,
}: {
  opcoes: { id: string; rotulo: string }[];
  escolhido: string;
  escolher?: (id: string) => void;
  /** Com link, cada opção é um endereço (#/graficos/corpo) em vez de um botão. */
  link?: (id: string) => string;
  rotulo: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex gap-0.5 rounded-[10px] bg-campo p-[3px]">
      {opcoes.map((o) => {
        const ativo = o.id === escolhido;
        // Largura pelo texto (flex-auto): "Curiosidades" cabe ao lado de "Corpo" sem cortar.
        const classe = `min-w-0 flex-auto truncate rounded-lg px-2 py-1.5 text-center text-[14px] font-medium ${
          ativo ? "bg-segmento text-texto shadow-[0_1px_3px_rgb(0_0_0/0.14)]" : "text-texto-2"
        }`;
        return link ? (
          <a key={o.id} href={link(o.id)} aria-current={ativo ? "page" : undefined} className={classe}>
            {o.rotulo}
          </a>
        ) : (
          <button key={o.id} type="button" aria-pressed={ativo} onClick={() => escolher?.(o.id)} className={classe}>
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

export function Etiqueta({ children, tom = "neutro" }: { children: ReactNode; tom?: "neutro" | "acento" | "aviso" }) {
  const tons = { neutro: "bg-campo text-texto-2", acento: "bg-acento-suave text-acento", aviso: "bg-aviso-suave text-aviso" };
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] leading-4 font-semibold ${tons[tom]}`}>{children}</span>;
}

const AVISOS = {
  info: { cor: "bg-campo text-texto-2", icone: "info" },
  bom: { cor: "bg-sucesso-suave text-sucesso", icone: "check" },
  ruim: { cor: "bg-aviso-suave text-aviso", icone: "alerta" },
  erro: { cor: "bg-perigo-suave text-perigo", icone: "alerta" },
} satisfies Record<string, { cor: string; icone: NomeIcone }>;

/** Recado curto com ícone. `titulo` sai em negrito, na cor do tipo; o resto, na cor do texto. */
export function Aviso({
  tipo,
  titulo,
  icone,
  children,
}: {
  tipo: keyof typeof AVISOS;
  titulo?: string;
  icone?: NomeIcone;
  children?: ReactNode;
}) {
  const { cor, icone: padrao } = AVISOS[tipo];
  return (
    <div className={`flex gap-2.5 rounded-lg px-3 py-2.5 text-[15px] leading-snug ${cor}`}>
      <Icone nome={icone ?? padrao} className="mt-px h-5 w-5" />
      <p className="min-w-0">
        {titulo && <strong className="font-semibold">{titulo}</strong>}
        {titulo && children ? " " : null}
        {children && <span className={titulo ? "text-texto-2" : ""}>{children}</span>}
      </p>
    </div>
  );
}

/** Janela por cima da tela. Abre ao aparecer; fecha no Esc, ao tocar fora ou por `fechar`.
 * `baixo`: sobe do pé da tela (listas para escolher), com um botão de fechar. */
export function Modal({
  titulo,
  fechar,
  children,
  posicao = "centro",
}: {
  titulo: string;
  fechar: () => void;
  children: ReactNode;
  posicao?: "centro" | "baixo";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (dialogo && !dialogo.open) dialogo.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onClose={fechar}
      // Fora da caixa, o toque cai no próprio <dialog> (o fundo escuro).
      onClick={(e) => e.target === e.currentTarget && fechar()}
      className={`${
        posicao === "baixo"
          ? "mx-auto mt-auto mb-0 max-h-[90dvh] w-full max-w-md rounded-t-2xl"
          : "m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl"
      } bg-superficie p-0 text-texto shadow-xl backdrop:bg-black/50`}
    >
      <div className={`space-y-4 p-5 ${posicao === "baixo" ? "pb-[max(1.25rem,env(safe-area-inset-bottom))]" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 id={idTitulo} className="text-[19px] leading-snug font-semibold">
            {titulo}
          </h2>
          {posicao === "baixo" && (
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              className="-mt-0.5 -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-campo text-texto-2"
            >
              <Icone nome="fechar" className="h-4 w-4" />
            </button>
          )}
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Pergunta antes de uma ação (no lugar do confirm() do navegador). */
export function Confirmar({
  titulo,
  mensagem,
  rotulo,
  perigo = false,
  confirmar,
  fechar,
}: {
  titulo: string;
  mensagem?: ReactNode;
  rotulo: string;
  perigo?: boolean;
  confirmar: () => void | Promise<void>;
  fechar: () => void;
}) {
  return (
    <Modal titulo={titulo} fechar={fechar}>
      {mensagem && <p className="text-[15px] leading-snug text-texto-2">{mensagem}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Botao onClick={fechar}>Cancelar</Botao>
        <Botao
          variante={perigo ? "perigo" : "principal"}
          onClick={() => {
            fechar();
            void confirmar();
          }}
        >
          {rotulo}
        </Botao>
      </div>
    </Modal>
  );
}
