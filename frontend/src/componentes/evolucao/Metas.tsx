// Metas na tela de Evolução: o editor, a linha de progresso embaixo dos gráficos e o parabéns.

import { useState } from "react";

import { formatarData, formatarNumero, lerNumero } from "../../lib/formato";
import {
  chaveComemoracao,
  daTela,
  ehDestino,
  formatarMeta,
  INFO_META,
  marcarComemorada,
  paraTela,
  problemaDaMeta,
  regraDaMeta,
  removerMeta,
  salvarMeta,
  sugerirProxima,
  type SituacaoMeta,
} from "../../lib/metas";
import type { Meta, TipoMeta } from "../../lib/tipos";
import { Icone } from "../icones";
import { Aviso, Botao, Campo, estiloEntrada, Modal } from "../ui";
import { Medidor } from "./base";

const textoDaTela = (tipo: TipoMeta, valor: number) => formatarNumero(paraTela(tipo, valor), 2);

export interface PedidoDeMeta {
  tipo: TipoMeta;
  exercicioId: string | null;
  /** Ex.: "Meta de carga no Supino reto". */
  titulo: string;
  meta: Meta | null;
  /** Valor de agora (recorde, peso médio), na unidade guardada: vira o ponto de partida. */
  atual: number | null;
  /** Frase sobre o valor de agora ("Seu recorde: 80 kg."). */
  contexto?: string;
  /** Atalhos de um toque (na unidade guardada). */
  sugestoes?: number[];
}

/** Editor de uma meta (definir, mudar ou tirar). Funciona offline. */
export function EditorMeta({ usuarioId, pedido, fechar }: { usuarioId: string; pedido: PedidoDeMeta; fechar: () => void }) {
  const { tipo, meta, atual } = pedido;
  const [texto, setTexto] = useState(meta ? textoDaTela(tipo, meta.valor) : "");
  const [erro, setErro] = useState<string | null>(null);
  const unidade = INFO_META[tipo].unidade;

  async function salvar() {
    const numero = lerNumero(texto);
    const valor = numero === null ? null : daTela(tipo, numero);
    const problema = problemaDaMeta(tipo, valor, atual);
    if (problema || valor === null) return setErro(problema ?? "Digite um número.");
    await salvarMeta(usuarioId, tipo, valor, ehDestino(tipo) ? atual : null, pedido.exercicioId);
    fechar();
  }

  return (
    <Modal titulo={pedido.titulo} fechar={fechar}>
      {pedido.contexto && <p className="text-[15px] leading-snug text-texto-2">{pedido.contexto}</p>}
      <Campo rotulo={unidade ? `Meta (${unidade})` : "Meta (treinos por semana)"} dica={ehDestino(tipo) ? undefined : regraDaMeta(tipo)}>
        <input
          className={estiloEntrada}
          inputMode={tipo === "kcal" || tipo === "treinos_semana" ? "numeric" : "decimal"}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setErro(null);
          }}
        />
      </Campo>
      {pedido.sugestoes && pedido.sugestoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pedido.sugestoes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTexto(textoDaTela(tipo, s));
                setErro(null);
              }}
              className="h-9 rounded-lg bg-campo px-3 text-[15px] tabular-nums active:opacity-75"
            >
              {formatarMeta(tipo, s)}
            </button>
          ))}
        </div>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="grid grid-cols-2 gap-2">
        <Botao onClick={fechar}>Cancelar</Botao>
        <Botao variante="principal" onClick={() => void salvar()}>
          Salvar
        </Botao>
      </div>
      {meta && (
        <Botao
          variante="perigoLeve"
          className="w-full"
          onClick={() => {
            void removerMeta(meta).then(fechar);
          }}
        >
          Tirar esta meta
        </Botao>
      )}
    </Modal>
  );
}

/** Embaixo de um gráfico de destino (peso, carga): progresso até a meta, ou o convite para ter uma. */
export function MetaDestino({
  situacao,
  cor,
  formatar,
  previsao,
  editar,
}: {
  situacao: SituacaoMeta | null;
  cor: string;
  formatar: (v: number) => string;
  /** Data em que chega lá no ritmo atual (AAAA-MM-DD). */
  previsao?: string | null;
  editar: () => void;
}) {
  if (!situacao) {
    return (
      <button type="button" onClick={editar} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-borda px-3 py-3 text-left active:bg-campo">
        <Icone nome="alvo" className="h-6 w-6 text-acento" />
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-acento">Definir uma meta</span>
          <span className="block text-[13px] leading-snug text-texto-2">Ela aparece no fim do gráfico, e o app avisa quando você chegar.</span>
        </span>
      </button>
    );
  }
  const { meta, progresso, falta, alcancadaEm } = situacao;
  if (alcancadaEm !== null) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-sucesso-suave px-3 py-3">
        <Icone nome="check" className="h-5 w-5 text-sucesso" strokeWidth={2.25} />
        <p className="min-w-0 flex-1 text-[15px] leading-snug">
          <strong className="font-semibold text-sucesso">Meta de {formatar(meta.valor)} alcançada</strong>{" "}
          <span className="text-texto-2">em {formatarData(new Date(alcancadaEm).toISOString())}.</span>
        </p>
        <Botao tamanho="pequeno" variante="principal" className="shrink-0" onClick={editar}>
          Nova meta
        </Botao>
      </div>
    );
  }
  const partes = [
    progresso !== null && `${Math.round(progresso * 100)}% do caminho`,
    falta !== null && `faltam ${formatar(falta)}`,
    previsao && `no ritmo atual, chega por volta de ${formatarData(previsao, { day: "2-digit", month: "2-digit", year: "2-digit" })}`,
  ].filter(Boolean);
  return (
    <div className="space-y-2.5 rounded-lg bg-campo px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[15px]">
          <Icone nome="alvo" className="h-5 w-5 text-texto-2" />
          <span>
            Meta: <strong className="font-semibold">{formatar(meta.valor)}</strong>
          </span>
        </p>
        <button type="button" onClick={editar} className="text-[15px] font-medium text-acento">
          Alterar
        </button>
      </div>
      {progresso !== null && <Medidor fracao={progresso} cor={cor} rotulo={`Caminho até a meta de ${formatar(meta.valor)}`} />}
      {partes.length > 0 && <p className="text-[13px] leading-snug text-texto-2">{partes.join(" · ")}</p>}
    </div>
  );
}

/** Embaixo de um gráfico do dia a dia (calorias, água, treinos por semana). */
export function MetaDiaria({ tipo, meta, resumo, editar }: { tipo: TipoMeta; meta: Meta | null; resumo?: string; editar: () => void }) {
  if (!meta) {
    return (
      <button type="button" onClick={editar} className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-borda px-3 py-2.5 text-left active:bg-campo">
        <Icone nome="alvo" className="h-5 w-5 text-acento" />
        <span className="text-[15px] font-medium text-acento">Definir meta de {INFO_META[tipo].nome.toLowerCase()}</span>
      </button>
    );
  }
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-campo px-3 py-3">
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-2 text-[15px]">
          <Icone nome="alvo" className="h-5 w-5 text-texto-2" />
          <span>
            Meta: <strong className="font-semibold">{formatarMeta(tipo, meta.valor)}</strong>
            {tipo !== "treinos_semana" && " por dia"}
          </span>
        </p>
        {resumo && <p className="text-[13px] leading-snug">{resumo}</p>}
        <p className="text-[13px] leading-snug text-texto-2">{regraDaMeta(tipo)}</p>
      </div>
      <button type="button" onClick={editar} className="shrink-0 text-[15px] font-medium text-acento">
        Alterar
      </button>
    </div>
  );
}

/** Chegou na meta: parabéns e a pergunta pela próxima (já com uma sugestão). */
export function Parabens({ usuarioId, situacao, onde, fechar }: { usuarioId: string; situacao: SituacaoMeta; onde: string; fechar: () => void }) {
  const { meta } = situacao;
  const [texto, setTexto] = useState(textoDaTela(meta.tipo, sugerirProxima(situacao)));
  const [erro, setErro] = useState<string | null>(null);
  const unidade = INFO_META[meta.tipo].unidade;

  async function agoraNao() {
    await marcarComemorada(chaveComemoracao(meta));
    fechar();
  }

  async function novaMeta() {
    const numero = lerNumero(texto);
    const valor = numero === null ? null : daTela(meta.tipo, numero);
    const problema = problemaDaMeta(meta.tipo, valor, situacao.atual);
    if (problema || valor === null) return setErro(problema ?? "Digite um número.");
    await marcarComemorada(chaveComemoracao(meta));
    await salvarMeta(usuarioId, meta.tipo, valor, situacao.atual, meta.exercicio_id);
    fechar();
  }

  return (
    <Modal titulo="Meta alcançada" fechar={() => void agoraNao()}>
      <div className="space-y-1.5">
        <p className="text-[17px] leading-snug">
          Parabéns: você chegou na meta de <strong className="font-semibold">{formatarMeta(meta.tipo, meta.valor)}</strong> {onde}.
        </p>
        <p className="text-[15px] leading-snug text-texto-2">
          {situacao.alcancadaEm !== null && `Foi em ${formatarData(new Date(situacao.alcancadaEm).toISOString())}. `}
          {situacao.partida !== null && `Quando definiu a meta, estava em ${formatarMeta(meta.tipo, situacao.partida)}.`}
        </p>
      </div>
      <p className="text-[17px] font-semibold">Quer colocar uma nova meta?</p>
      <Campo rotulo={`Nova meta (${unidade})`}>
        <input
          className={estiloEntrada}
          inputMode="decimal"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setErro(null);
          }}
        />
      </Campo>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="grid grid-cols-2 gap-2">
        <Botao onClick={() => void agoraNao()}>Agora não</Botao>
        <Botao variante="principal" onClick={() => void novaMeta()}>
          Salvar meta
        </Botao>
      </div>
    </Modal>
  );
}

