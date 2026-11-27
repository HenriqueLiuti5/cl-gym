// Seletor de exercício da edição do treino (telas/EditarFicha.tsx): janela que sobe do pé da tela,
// com busca sem acento, os grupos musculares em botões que rolam para o lado e a lista agrupada,
// com miniatura. Serve para adicionar (vários seguidos, fechando em "Pronto") e para escolher uma
// opção do Plano B (os parecidos com o exercício aparecem primeiro). No fim da lista, "Criar
// exercício" grava um exercício próprio, que já entra no treino. O filtro e a busca ficam em
// lib/fichas.ts; o seletor dos gráficos é outro (componentes/evolucao/SeletorExercicio.tsx).

import { useState } from "react";

import { agora, salvar } from "../lib/db";
import {
  agruparPorGrupo,
  criarExercicio,
  filtrarExercicios,
  gruposDe,
  LIMITES,
  ORDEM_GRUPOS,
  problemasDoExercicio,
  separarSugestoes,
} from "../lib/fichas";
import { novoId } from "../lib/ids";
import { sincronizarEmBreve } from "../lib/sync";
import type { Exercicio } from "../lib/tipos";
import { Icone } from "./icones";
import { Aviso, Botao, Campo, estiloEntrada, Modal } from "./ui";

export type UsoDoSeletor =
  | {
      para: "adicionar";
      /** Exercícios que já estão no treino (aparecem marcados). */
      noTreino: ReadonlySet<string>;
      adicionar: (exercicio: Exercicio) => void;
      /** Desfaz um que foi adicionado com a janela aberta (tocar de novo nele). */
      tirar: (exercicioId: string) => void;
    }
  | {
      para: "planoB";
      /** O exercício do treino: os substitutos dele vêm primeiro, e ele mesmo não aparece. */
      base: Exercicio | undefined;
      /** A opção que está no lugar agora (aparece marcada). */
      atual: string | null;
      /** Não aparecem (a outra opção do Plano B). */
      evitar: ReadonlySet<string>;
      escolher: (exercicioId: string) => void;
    };

/** Primeira imagem num quadrado fixo, para a lista não pular enquanto carrega; sem imagem, um quadrado neutro. */
function Miniatura({ exercicio }: { exercicio: Exercicio }) {
  const [falhou, setFalhou] = useState(false);
  const imagem = exercicio.imagens[0];
  if (!imagem || falhou) {
    return (
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-linha text-texto-3">
        <Icone nome="halter" className="h-6 w-6" />
      </span>
    );
  }
  return (
    <img
      src={imagem}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      onError={() => setFalhou(true)}
      className="h-12 w-12 shrink-0 rounded-md bg-white object-contain"
    />
  );
}

function LinhaExercicio({ exercicio, marcado, dica, mostrarMais, tocar }: {
  exercicio: Exercicio;
  marcado: boolean;
  dica?: string;
  mostrarMais: boolean;
  tocar: () => void;
}) {
  return (
    <li>
      <button type="button" onClick={tocar} aria-pressed={marcado} className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left active:bg-linha">
        <Miniatura exercicio={exercicio} />
        <span className="min-w-0 flex-1">
          <span className={`line-clamp-2 block text-[17px] leading-snug ${marcado ? "font-semibold text-acento" : ""}`}>{exercicio.nome}</span>
          {dica && <span className="block text-[13px] text-texto-2">{dica}</span>}
        </span>
        {marcado ? (
          <Icone nome="check" className="h-6 w-6 text-acento" strokeWidth={2.25} />
        ) : (
          mostrarMais && <Icone nome="mais" className="h-5 w-5 text-texto-3" />
        )}
      </button>
    </li>
  );
}

function CriarExercicio({ exercicios, nomeInicial, grupoInicial, criado, voltar }: {
  exercicios: Exercicio[];
  nomeInicial: string;
  grupoInicial: string | null;
  criado: (exercicio: Exercicio) => void;
  voltar: () => void;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [grupo, setGrupo] = useState<string | null>(grupoInicial);
  const [tentou, setTentou] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState(false);
  const grupos = gruposDe(exercicios);
  const problemas = problemasDoExercicio(nome, grupo, exercicios);

  async function criar() {
    if (gravando) return;
    if (problemas.length) {
      setTentou(true);
      return;
    }
    setGravando(true);
    setErro(false);
    const exercicio = criarExercicio(nome, grupo!, novoId(), agora());
    try {
      await salvar("exercicios", exercicio);
    } catch {
      setErro(true);
      return;
    } finally {
      setGravando(false);
    }
    sincronizarEmBreve();
    criado(exercicio);
  }

  return (
    <div className="space-y-4">
      <Campo rotulo="Nome do exercício">
        <input
          className={estiloEntrada}
          value={nome}
          maxLength={LIMITES.nomeExercicio}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Remada na polia baixa"
          autoCapitalize="sentences"
          enterKeyHint="done"
        />
      </Campo>
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Grupo muscular</p>
        <div role="group" aria-label="Grupo muscular" className="flex flex-wrap gap-2">
          {/* Sem nenhum exercício no aparelho (antes da primeira sincronização), os do catálogo. */}
          {(grupos.length ? grupos : ORDEM_GRUPOS).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={grupo === g}
              onClick={() => setGrupo(g)}
              className={`h-11 rounded-lg px-3.5 text-[15px] ${grupo === g ? "bg-acento-forte font-semibold text-white" : "bg-campo text-texto"}`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[13px] leading-snug text-texto-3">Fica só na sua conta, sem imagens. Dá para usar em qualquer treino seu.</p>
      {tentou && problemas.length > 0 && <Aviso tipo="erro">{problemas.join(" ")}</Aviso>}
      {erro && <Aviso tipo="erro">Não deu para gravar no aparelho. Tente de novo.</Aviso>}
      <div className="grid grid-cols-2 gap-2">
        <Botao onClick={voltar}>Voltar</Botao>
        <Botao variante="principal" disabled={gravando} onClick={() => void criar()}>
          Criar
        </Botao>
      </div>
    </div>
  );
}

export function EscolherExercicio({ exercicios, uso, fechar }: { exercicios: Exercicio[]; uso: UsoDoSeletor; fechar: () => void }) {
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState<string | null>(null);
  /** Com a janela aberta para adicionar, os que entraram agora: tocar de novo tira. */
  const [agoraAdicionados, setAgoraAdicionados] = useState<ReadonlySet<string>>(new Set());
  const [criando, setCriando] = useState(false);

  const grupos = gruposDe(exercicios);
  const ocultos = new Set(uso.para === "planoB" ? [...uso.evitar, ...(uso.base ? [uso.base.id] : [])] : []);
  const visiveis = filtrarExercicios(exercicios, busca, grupo).filter((e) => !ocultos.has(e.id));
  const { sugestoes, resto } = uso.para === "planoB" ? separarSugestoes(uso.base, visiveis) : { sugestoes: [], resto: visiveis };
  // No Plano B, o grupo do próprio exercício vem logo depois das sugestões.
  const porGrupo = agruparPorGrupo(resto, uso.para === "planoB" ? uso.base?.grupo_muscular : undefined);

  const marcado = (id: string) => (uso.para === "adicionar" ? uso.noTreino.has(id) : uso.atual === id);
  const dica = (id: string) => (uso.para === "adicionar" && uso.noTreino.has(id) && !agoraAdicionados.has(id) ? "Já está no treino" : undefined);

  function tocar(exercicio: Exercicio) {
    if (uso.para === "planoB") {
      uso.escolher(exercicio.id);
      return;
    }
    if (!uso.noTreino.has(exercicio.id)) {
      uso.adicionar(exercicio);
      setAgoraAdicionados((s) => new Set(s).add(exercicio.id));
    } else if (agoraAdicionados.has(exercicio.id)) {
      uso.tirar(exercicio.id);
      setAgoraAdicionados((s) => {
        const novo = new Set(s);
        novo.delete(exercicio.id);
        return novo;
      });
    }
  }

  const linha = (e: Exercicio) => (
    <LinhaExercicio key={e.id} exercicio={e} marcado={marcado(e.id)} dica={dica(e.id)} mostrarMais={uso.para === "adicionar"} tocar={() => tocar(e)} />
  );

  // Uma janela só, que troca de conteúdo: fechar e abrir outra piscaria a tela.
  return (
    <Modal titulo={criando ? "Criar exercício" : uso.para === "adicionar" ? "Adicionar exercício" : "Plano B"} fechar={fechar} posicao="baixo">
      {criando ? (
        <CriarExercicio
          exercicios={exercicios}
          nomeInicial={busca.trim()}
          grupoInicial={grupo ?? (uso.para === "planoB" ? (uso.base?.grupo_muscular ?? null) : null)}
          voltar={() => setCriando(false)}
          criado={(exercicio) => {
            setCriando(false);
            setBusca("");
            setGrupo(null);
            tocar(exercicio);
          }}
        />
      ) : (
        <>
          {uso.para === "planoB" && uso.base && (
            <p className="-mt-2 text-[15px] leading-snug text-texto-2">
              Para fazer no lugar de {uso.base.nome} quando o aparelho estiver ocupado.
            </p>
          )}
          <input
            className={estiloEntrada}
            type="search"
            placeholder="Buscar exercício"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar exercício"
            enterKeyHint="search"
          />
          <div className="sem-barra-de-rolagem -mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Grupo muscular">
            {[null, ...grupos].map((g) => (
              <button
                key={g ?? "todos"}
                type="button"
                aria-pressed={grupo === g}
                onClick={() => setGrupo(g)}
                className={`h-11 shrink-0 rounded-lg px-3.5 text-[15px] ${grupo === g ? "bg-acento-forte font-semibold text-white" : "bg-campo text-texto"}`}
              >
                {g ?? "Todos"}
              </button>
            ))}
          </div>
          {/* Altura fixa: a janela não encolhe (nem a busca pula) enquanto a lista filtra. */}
          <div className="h-[calc(90dvh-19rem)] min-h-48 space-y-4 overflow-y-auto overscroll-contain">
            {sugestoes.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-[13px] font-semibold text-texto-2">Sugestões: parecidos</h3>
                <ul className="lista overflow-hidden rounded-lg bg-campo">{sugestoes.map(linha)}</ul>
              </section>
            )}
            {visiveis.length === 0 && (
              <p className="pt-4 pb-1 text-center text-[15px] text-texto-3">
                {busca.trim() ? "Nenhum exercício com esse nome." : "Nenhum exercício neste grupo."}
              </p>
            )}
            {porGrupo.map(({ grupo: g, itens }) => (
              <section key={g}>
                <h3 className="mb-1.5 text-[13px] font-semibold text-texto-2">{g}</h3>
                <ul className="lista overflow-hidden rounded-lg bg-campo">{itens.map(linha)}</ul>
              </section>
            ))}
            <button
              type="button"
              onClick={() => setCriando(true)}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg bg-campo px-3 py-2 text-left text-[17px] font-medium text-acento active:bg-linha"
            >
              <span className="grid w-12 shrink-0 place-items-center">
                <Icone nome="mais" className="h-5 w-5" />
              </span>
              Criar exercício
            </button>
          </div>
          {uso.para === "adicionar" && (
            <Botao variante="principal" className="w-full" onClick={fechar}>
              Pronto
            </Botao>
          )}
        </>
      )}
    </Modal>
  );
}
