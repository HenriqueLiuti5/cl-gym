// Criar (#/editar/nova) e editar (#/editar/<fichaId>) um treino. O rascunho fica em memória e só
// é gravado ao tocar em Salvar, numa transação: a ficha, os itens novos e só os que mudaram (o que
// gravar sai de lib/fichas.ts). Apagar é exclusão lógica da ficha e dos itens; as sessões ficam,
// para o histórico e os gráficos continuarem.

import { useLiveQuery } from "dexie-react-hooks";
import { useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";

import { EscolherExercicio, type UsoDoSeletor } from "../componentes/EscolherExercicio";
import { Icone } from "../componentes/icones";
import { Aviso, BarraTopo, Botao, Confirmar, Grupo } from "../componentes/ui";
import { agora, db, salvar } from "../lib/db";
import {
  houveMudanca,
  LIMITES,
  montarGravacao,
  moverItem,
  novoItem,
  problemasDoRascunho,
  rascunhoDe,
  registrosParaApagar,
  type ItemRascunho,
} from "../lib/fichas";
import { novoId } from "../lib/ids";
import { sincronizarEmBreve } from "../lib/sync";
import type { Exercicio, Ficha, FichaExercicio } from "../lib/tipos";

// De onde a edição foi aberta. Ao sair para lá (Salvar ou voltar), o app volta no histórico em vez
// de empilhar a tela de novo: assim o "voltar" do celular, depois, não cai outra vez na edição.
// null: aberta direto pelo endereço (ao recarregar), sem saber o que vem antes no histórico.
let enderecoAnterior: string | null = null;
window.addEventListener("hashchange", (evento) => {
  const hash = new URL(evento.oldURL).hash;
  enderecoAnterior = hash === "" || hash === "#" ? "#/" : hash;
});

/** Sai da edição para `destino`: volta no histórico se veio de lá; senão, troca a edição por ele. */
function sairPara(destino: string, veioDe: string | null): void {
  if (veioDe === destino) window.history.back();
  else window.location.replace(destino);
}

const botaoIcone =
  "grid h-11 w-11 shrink-0 place-items-center rounded-lg text-acento active:bg-campo disabled:text-texto-3 disabled:opacity-40";

/** Número com − e + (séries, alvo de repetições). */
function Ajuste({ rotulo, valor, min, max, aoMudar }: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  aoMudar: (v: number) => void;
}) {
  const botao = "grid h-11 w-11 place-items-center rounded-lg bg-campo text-texto active:opacity-75 disabled:opacity-40";
  return (
    <div className="flex min-h-13 items-center justify-between gap-3 py-1.5 pr-3 pl-4">
      <span className="text-[17px]">{rotulo}</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={`Menos ${rotulo.toLowerCase()}`} className={botao} disabled={valor <= min} onClick={() => aoMudar(valor - 1)}>
          <Icone nome="menos" className="h-5 w-5" />
        </button>
        <span className="w-10 text-center text-[17px] font-semibold tabular-nums">{valor}</span>
        <button type="button" aria-label={`Mais ${rotulo.toLowerCase()}`} className={botao} disabled={valor >= max} onClick={() => aoMudar(valor + 1)}>
          <Icone nome="mais" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/** Linha com interruptor (a linha toda é o toque). */
function LinhaInterruptor({ rotulo, dica, ligado, aoMudar }: { rotulo: string; dica: string; ligado: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={() => aoMudar(!ligado)}
      className="flex min-h-13 w-full items-center gap-3 py-2 pr-3 pl-4 text-left active:bg-campo"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[17px]">{rotulo}</span>
        <span className="block text-[13px] leading-snug text-texto-3">{dica}</span>
      </span>
      <span
        aria-hidden
        className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors motion-reduce:transition-none ${ligado ? "bg-acento-forte" : "bg-borda"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-[27px] w-[27px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform motion-reduce:transition-none ${ligado ? "translate-x-5" : ""}`}
        />
      </span>
    </button>
  );
}

/** As opções do Plano B, em ordem: tocar troca, o X tira; "Adicionar opção" enquanto couber. */
function PlanoB({ item, nomeDe, escolher, tirar }: {
  item: ItemRascunho;
  nomeDe: (id: string) => string;
  /** Abre o seletor para a opção da `posicao` (a seguinte às que existem, para adicionar). */
  escolher: (posicao: number) => void;
  tirar: (posicao: number) => void;
}) {
  return (
    <div className="py-3 pr-3 pl-4">
      <p className="text-[17px]">Plano B</p>
      <p className="text-[13px] leading-snug text-texto-3">Para quando o aparelho estiver ocupado. Até 2 opções, na ordem de preferência.</p>
      {item.alternativas.length > 0 && (
        <ol className="mt-2 space-y-1.5">
          {item.alternativas.map((id, posicao) => (
            <li key={posicao} className="flex items-center rounded-lg bg-campo">
              <button
                type="button"
                onClick={() => escolher(posicao)}
                aria-label={`Trocar a opção ${posicao + 1} do Plano B, ${nomeDe(id)}`}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2 pl-3 text-left active:opacity-75"
              >
                <span className="w-3 shrink-0 text-[15px] text-texto-3 tabular-nums">{posicao + 1}</span>
                <span className="min-w-0 flex-1 text-[15px] leading-snug">{nomeDe(id)}</span>
                <span className="shrink-0 text-[15px] font-medium text-acento">Trocar</span>
              </button>
              <button
                type="button"
                onClick={() => tirar(posicao)}
                aria-label={`Tirar ${nomeDe(id)} do Plano B`}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-texto-2 active:opacity-75"
              >
                <Icone nome="fechar" className="h-4.5 w-4.5" />
              </button>
            </li>
          ))}
        </ol>
      )}
      {item.alternativas.length < LIMITES.alternativas && (
        <button
          type="button"
          onClick={() => escolher(item.alternativas.length)}
          className="-ml-1 mt-1 flex h-11 items-center gap-1.5 rounded-lg px-1 text-[15px] font-medium text-acento active:bg-acento-suave"
        >
          <Icone nome="mais" className="h-4.5 w-4.5" />
          {item.alternativas.length ? "Adicionar outra opção" : "Adicionar opção"}
        </button>
      )}
    </div>
  );
}

function CartaoItem({ item, posicao, total, exercicio, nomeDe, mudar, mover, remover, escolherPlanoB }: {
  item: ItemRascunho;
  posicao: number;
  total: number;
  exercicio: Exercicio | undefined;
  nomeDe: (id: string) => string;
  mudar: (campos: Partial<ItemRascunho>) => void;
  mover: (lado: -1 | 1, botao: HTMLElement) => void;
  remover: () => void;
  escolherPlanoB: (posicao: number) => void;
}) {
  const nome = nomeDe(item.exercicio_id);
  return (
    <section data-item className="overflow-hidden rounded-xl bg-superficie">
      <div className="lista">
        <div className="flex items-center gap-1 py-1.5 pr-1.5 pl-4">
          <div className="min-w-0 flex-1 py-1">
            <p className="text-[17px] leading-snug font-semibold">{nome}</p>
            {exercicio && <p className="text-[14px] text-texto-2">{exercicio.grupo_muscular}</p>}
          </div>
          <button type="button" aria-label={`Subir ${nome}`} disabled={posicao === 0} onClick={(e) => mover(-1, e.currentTarget)} className={botaoIcone}>
            <Icone nome="subir" className="h-5.5 w-5.5" />
          </button>
          <button type="button" aria-label={`Descer ${nome}`} disabled={posicao === total - 1} onClick={(e) => mover(1, e.currentTarget)} className={botaoIcone}>
            <Icone nome="descer" className="h-5.5 w-5.5" />
          </button>
        </div>
        <Ajuste rotulo="Séries" valor={item.series} min={LIMITES.series.min} max={LIMITES.series.max} aoMudar={(series) => mudar({ series })} />
        <Ajuste
          rotulo="Alvo de repetições"
          valor={item.alvo_reps}
          min={LIMITES.alvo.min}
          max={LIMITES.alvo.max}
          aoMudar={(alvo_reps) => mudar({ alvo_reps })}
        />
        <LinhaInterruptor
          rotulo="Aquecimento"
          dica="1×10 leve antes (uns 50% do peso). Normalmente só no primeiro."
          ligado={item.aquecimento}
          aoMudar={(aquecimento) => mudar({ aquecimento })}
        />
        <PlanoB
          item={item}
          nomeDe={nomeDe}
          escolher={escolherPlanoB}
          tirar={(p) => mudar({ alternativas: item.alternativas.filter((_, j) => j !== p) })}
        />
        <div className="px-4 py-3">
          <textarea
            value={item.observacao}
            onChange={(e) => mudar({ observacao: e.target.value })}
            maxLength={LIMITES.observacao}
            rows={2}
            aria-label={`Observação de ${nome}`}
            placeholder="Observação (opcional): dicas de execução"
            autoCapitalize="sentences"
            className="block w-full resize-none rounded-lg border border-transparent bg-campo px-3.5 py-2.5 text-[17px] leading-snug text-texto outline-none placeholder:text-texto-3 focus:border-acento"
          />
        </div>
        <div className="px-2 py-1">
          <button
            type="button"
            onClick={remover}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-[15px] font-medium text-perigo active:bg-perigo-suave"
          >
            <Icone nome="lixeira" className="h-5 w-5" />
            Tirar do treino
          </button>
        </div>
      </div>
    </section>
  );
}

function NaoEncontrado({ apagado }: { apagado: boolean }) {
  return (
    <div>
      <BarraTopo voltar="#/" titulo={apagado ? "Treino apagado" : "Treino não encontrado"} />
      <p className="px-1 text-[15px] text-texto-2">
        {apagado ? "Este treino foi apagado. Os treinos já feitos com ele continuam no histórico." : "Este treino não está neste aparelho."}
      </p>
    </div>
  );
}

/** O que o seletor de exercício está escolhendo. */
type Escolha = { para: "adicionar" } | { para: "planoB"; itemId: string; posicao: number };

function Editor({ ficha, itensOriginais, exercicios, emAndamento }: {
  /** null: treino novo. */
  ficha: Ficha | null;
  itensOriginais: FichaExercicio[];
  exercicios: Exercicio[];
  /** Há um treino desta ficha começado e não terminado. */
  emAndamento: boolean;
}) {
  const [inicial] = useState(() => rascunhoDe(ficha, itensOriginais));
  const [rascunho, setRascunho] = useState(inicial);
  const [veioDe] = useState(() => enderecoAnterior);
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [descartando, setDescartando] = useState(false);

  // A ficha foi apagada em outro aparelho. Apagada aqui, a edição fica na tela até a troca de tela.
  if (ficha?.excluido && !saindo) return <NaoEncontrado apagado />;

  const porId = new Map(exercicios.map((e) => [e.id, e]));
  const nomeDe = (id: string) => porId.get(id)?.nome ?? "Exercício";
  const problemas = problemasDoRascunho(rascunho, nomeDe);
  const voltar = ficha ? `#/ficha/${ficha.id}` : "#/";
  const idsIniciais = new Set(inicial.itens.map((i) => i.id));

  const mudarItem = (id: string, campos: Partial<ItemRascunho>) =>
    setRascunho((r) => ({ ...r, itens: r.itens.map((i) => (i.id === id ? { ...i, ...campos } : i)) }));

  /** Sobe ou desce um exercício. A página rola junto, para o cartão ficar embaixo do dedo. */
  function mover(posicao: number, lado: -1 | 1, botao: HTMLElement) {
    const cartao = botao.closest<HTMLElement>("[data-item]");
    const antes = cartao?.getBoundingClientRect().top;
    flushSync(() => setRascunho((r) => ({ ...r, itens: moverItem(r.itens, posicao, posicao + lado) })));
    if (cartao && antes !== undefined) window.scrollBy(0, cartao.getBoundingClientRect().top - antes);
  }

  function adicionar(exercicio: Exercicio) {
    const id = novoId();
    setRascunho((r) => ({ ...r, itens: [...r.itens, novoItem(exercicio, porId, id, r.itens.length === 0)] }));
  }

  /** Desfaz no seletor o que acabou de entrar: tira o último item novo com esse exercício. */
  function tirarAdicionado(exercicioId: string) {
    setRascunho((r) => {
      for (let i = r.itens.length - 1; i >= 0; i--) {
        const item = r.itens[i]!;
        if (item.exercicio_id === exercicioId && !idsIniciais.has(item.id)) return { ...r, itens: r.itens.filter((_, j) => j !== i) };
      }
      return r;
    });
  }

  function escolherPlanoB(itemId: string, posicao: number, exercicioId: string) {
    setRascunho((r) => ({
      ...r,
      itens: r.itens.map((i) => {
        if (i.id !== itemId) return i;
        const alternativas = [...i.alternativas];
        alternativas[posicao] = exercicioId;
        return { ...i, alternativas };
      }),
    }));
    setEscolha(null);
  }

  async function gravar() {
    if (salvando) return;
    if (problemas.length) {
      setTentou(true);
      const reduzir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      window.scrollTo({ top: 0, behavior: reduzir ? "auto" : "smooth" });
      return;
    }
    setSalvando(true);
    setErro(false);
    try {
      const { fichaId, mudou } = await db.transaction("rw", db.fichas, db.ficha_exercicios, async () => {
        const fichas = await db.fichas.toArray();
        const atual = ficha ? ((await db.fichas.get(ficha.id)) ?? ficha) : null;
        const itens = atual ? await db.ficha_exercicios.where("ficha_id").equals(atual.id).toArray() : [];
        const gravacao = montarGravacao(rascunho, { ficha: atual, itens, fichas }, novoId, agora());
        if (gravacao.ficha) await salvar("fichas", gravacao.ficha);
        for (const item of gravacao.itens) await salvar("ficha_exercicios", item);
        return { fichaId: gravacao.fichaId, mudou: gravacao.ficha !== null || gravacao.itens.length > 0 };
      });
      if (mudou) sincronizarEmBreve();
      // Fica "salvando" até a tela sair: um segundo toque criaria outro treino.
      sairPara(`#/ficha/${fichaId}`, veioDe);
    } catch {
      setSalvando(false);
      setErro(true);
    }
  }

  async function apagar() {
    if (!ficha) return;
    setSaindo(true);
    setErro(false);
    try {
      await db.transaction("rw", db.fichas, db.ficha_exercicios, async () => {
        const atual = (await db.fichas.get(ficha.id)) ?? ficha;
        const itens = await db.ficha_exercicios.where("ficha_id").equals(ficha.id).toArray();
        const apagados = registrosParaApagar(atual, itens);
        await salvar("fichas", apagados.ficha);
        for (const item of apagados.itens) await salvar("ficha_exercicios", item);
      });
    } catch {
      setSaindo(false);
      setErro(true);
      return;
    }
    sincronizarEmBreve();
    sairPara("#/", veioDe);
  }

  /** O voltar da barra (um link): com mudanças, pergunta antes de descartar. */
  function aoClicar(evento: MouseEvent<HTMLDivElement>) {
    const link = (evento.target as Element).closest("a[data-voltar]");
    if (!link) return;
    evento.preventDefault();
    if (houveMudanca(rascunho, inicial)) setDescartando(true);
    else sairPara(voltar, veioDe);
  }

  let uso: UsoDoSeletor | null = null;
  if (escolha?.para === "adicionar") {
    uso = { para: "adicionar", noTreino: new Set(rascunho.itens.map((i) => i.exercicio_id)), adicionar, tirar: tirarAdicionado };
  } else if (escolha?.para === "planoB") {
    const item = rascunho.itens.find((i) => i.id === escolha.itemId);
    if (item) {
      uso = {
        para: "planoB",
        base: porId.get(item.exercicio_id),
        atual: item.alternativas[escolha.posicao] ?? null,
        evitar: new Set(item.alternativas.filter((_, j) => j !== escolha.posicao)),
        escolher: (id) => escolherPlanoB(item.id, escolha.posicao, id),
      };
    }
  }

  const total = rascunho.itens.length;
  return (
    <div onClickCapture={aoClicar}>
      <BarraTopo
        voltar={voltar}
        titulo={ficha ? "Editar treino" : "Novo treino"}
        acao={
          <button
            type="button"
            onClick={() => void gravar()}
            disabled={salvando}
            className="h-11 rounded-lg px-2 text-[17px] font-semibold text-acento active:bg-campo disabled:opacity-40"
          >
            Salvar
          </button>
        }
      />
      {tentou && problemas.length > 0 && (
        <div className="mb-4">
          <Aviso tipo="erro" titulo="Falta pouco para salvar.">
            {problemas.join(" ")}
          </Aviso>
        </div>
      )}
      {erro && (
        <div className="mb-4">
          <Aviso tipo="erro" titulo="Não deu para gravar no aparelho.">
            Tente de novo.
          </Aviso>
        </div>
      )}

      <div className="space-y-6">
        <Grupo titulo="Nome do treino">
          <input
            value={rascunho.nome}
            onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))}
            maxLength={LIMITES.nomeFicha}
            aria-label="Nome do treino"
            placeholder="Ex.: Push, Pernas, Treino A"
            autoCapitalize="sentences"
            enterKeyHint="done"
            className="h-12 w-full bg-transparent px-4 text-[17px] text-texto outline-none placeholder:text-texto-3"
          />
        </Grupo>

        <section>
          <h2 className="mb-1.5 px-4 text-[13px] font-semibold text-texto-2">Exercícios{total ? ` (${total})` : ""}</h2>
          <div className="space-y-3">
            {total === 0 && (
              <p className="rounded-xl bg-superficie px-4 py-3.5 text-[15px] leading-snug text-texto-2">
                Nenhum exercício ainda. Adicione os do treino na ordem em que vai fazer; dá para mudar a ordem depois.
              </p>
            )}
            {rascunho.itens.map((item, posicao) => (
              <CartaoItem
                key={item.id}
                item={item}
                posicao={posicao}
                total={total}
                exercicio={porId.get(item.exercicio_id)}
                nomeDe={nomeDe}
                mudar={(campos) => mudarItem(item.id, campos)}
                mover={(lado, botao) => mover(posicao, lado, botao)}
                remover={() => setRascunho((r) => ({ ...r, itens: r.itens.filter((i) => i.id !== item.id) }))}
                escolherPlanoB={(p) => setEscolha({ para: "planoB", itemId: item.id, posicao: p })}
              />
            ))}
            <button
              type="button"
              onClick={() => setEscolha({ para: "adicionar" })}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-superficie text-[17px] font-medium text-acento active:opacity-75"
            >
              <Icone nome="mais" className="h-5 w-5" />
              Adicionar exercício
            </button>
          </div>
          <p className="mt-1.5 px-4 text-[13px] leading-snug text-texto-3">
            O alvo é um número só: mesmo peso em todas as séries, parando a 1–2 reps da falha.
          </p>
        </section>

        {ficha && (
          <Botao variante="perigoLeve" className="w-full" onClick={() => setApagando(true)}>
            <Icone nome="lixeira" className="h-5 w-5" />
            Apagar treino
          </Botao>
        )}
      </div>

      {uso && <EscolherExercicio exercicios={exercicios} uso={uso} fechar={() => setEscolha(null)} />}
      {apagando && ficha && (
        <Confirmar
          titulo={`Apagar o treino ${ficha.nome}?`}
          mensagem={
            <>
              Os treinos já feitos com ele continuam no histórico e nos gráficos.
              {emAndamento &&
                " Tem um treino dele em andamento: as séries já anotadas ficam salvas, mas os exercícios saem da tela do treino. Se quiser, termine o treino antes."}
            </>
          }
          rotulo="Apagar"
          perigo
          confirmar={apagar}
          fechar={() => setApagando(false)}
        />
      )}
      {descartando && (
        <Confirmar
          titulo="Descartar as mudanças?"
          mensagem="O que você mudou neste treino ainda não foi salvo."
          rotulo="Descartar"
          perigo
          confirmar={() => sairPara(voltar, veioDe)}
          fechar={() => setDescartando(false)}
        />
      )}
    </div>
  );
}

export function EditarFicha({ fichaId }: { fichaId: string | null }) {
  // null: não existe (ou é um treino novo); undefined: ainda carregando.
  const ficha = useLiveQuery(async () => (fichaId ? ((await db.fichas.get(fichaId)) ?? null) : null), [fichaId]);
  const itens = useLiveQuery(() => (fichaId ? db.ficha_exercicios.where("ficha_id").equals(fichaId).toArray() : []), [fichaId]);
  const exercicios = useLiveQuery(() => db.exercicios.toArray(), []);
  const emAndamento = useLiveQuery(
    () => (fichaId ? db.sessoes.where("ficha_id").equals(fichaId).filter((s) => !s.excluido && !s.finalizada_em).count() : 0),
    [fichaId],
  );
  // Nada até os dados chegarem do IndexedDB: o Palco espera para fotografar a troca de tela.
  if (ficha === undefined || !itens || !exercicios || emAndamento === undefined) return null;
  if (fichaId && !ficha) return <NaoEncontrado apagado={false} />;
  return <Editor key={fichaId ?? "nova"} ficha={ficha} itensOriginais={itens} exercicios={exercicios} emAndamento={emAndamento > 0} />;
}
