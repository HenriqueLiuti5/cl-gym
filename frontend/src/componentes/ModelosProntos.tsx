// "Usar um modelo pronto": janela de baixo com os treinos já montados (GET /api/modelos). Adicionar
// copia o modelo para as fichas da pessoa no aparelho, com ids novos, e a cópia vai ao servidor
// na sincronização. A lista de modelos precisa de internet; a cópia, não.

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

import { api, ErroApi } from "../lib/api";
import { agora, db, salvar } from "../lib/db";
import { novoId } from "../lib/ids";
import { copiarModelos, proximaOrdem, resumoDoTreino, type Modelo } from "../lib/modelos";
import { ir } from "../lib/rota";
import { sincronizarEmBreve } from "../lib/sync";
import { Aviso, Botao, Modal } from "./ui";

type Carga = { fase: "carregando" } | { fase: "erro"; texto: string } | { fase: "pronto"; modelos: Modelo[] };

async function buscarModelos(): Promise<Carga> {
  try {
    return { fase: "pronto", modelos: await api<Modelo[]>("/modelos") };
  } catch (e) {
    // Status 0 é falta de conexão (ou servidor fora do ar); nos outros, a mensagem do servidor.
    if (e instanceof ErroApi && e.status !== 0) return { fase: "erro", texto: e.message };
    return { fase: "erro", texto: "Precisa de internet para ver os modelos prontos. Tente de novo quando a conexão voltar." };
  }
}

/** Copia os modelos para as fichas da pessoa, depois da última, e devolve os ids das fichas novas. */
async function adicionar(modelos: Modelo[]): Promise<string[]> {
  const ids = await db.transaction("rw", db.fichas, db.ficha_exercicios, async () => {
    const copias = copiarModelos(modelos, proximaOrdem(await db.fichas.toArray()), novoId, agora());
    for (const { ficha, itens } of copias) {
      await salvar("fichas", ficha);
      for (const item of itens) await salvar("ficha_exercicios", item);
    }
    return copias.map((c) => c.ficha.id);
  });
  sincronizarEmBreve();
  return ids;
}

export function ModelosProntos({ fechar }: { fechar: () => void }) {
  const [carga, setCarga] = useState<Carga>({ fase: "carregando" });
  const [ocupado, setOcupado] = useState(false);
  const [erroAoAdicionar, setErroAoAdicionar] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    void buscarModelos().then((nova) => {
      if (ativo) setCarga(nova);
    });
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  function tentarDeNovo() {
    setCarga({ fase: "carregando" });
    setTentativa((t) => t + 1);
  }

  // Nomes dos exercícios, do banco local (o catálogo vem na sincronização).
  const modelos = carga.fase === "pronto" ? carga.modelos : [];
  const idsExercicios = [...new Set(modelos.flatMap((m) => m.exercicios.map((i) => i.exercicio_id)))];
  const chave = idsExercicios.join(",");
  const nomes = useLiveQuery(async () => {
    const achados = await db.exercicios.bulkGet(chave ? chave.split(",") : []);
    return new Map(achados.flatMap((e) => (e ? [[e.id, e.nome] as const] : [])));
  }, [chave]);

  async function usar(escolhidos: Modelo[]) {
    setOcupado(true);
    setErroAoAdicionar(null);
    try {
      const ids = await adicionar(escolhidos);
      // Fecha antes de trocar de tela, para a janela não sair na foto da transição (Palco).
      flushSync(fechar);
      // Um modelo só: abre a ficha nova, para a pessoa ver o que entrou e ajustar.
      if (ids.length === 1) ir(`/ficha/${ids[0]}`);
    } catch {
      setErroAoAdicionar("Não deu para adicionar agora. Tente de novo.");
      setOcupado(false);
    }
  }

  return (
    <Modal titulo="Modelos prontos" posicao="baixo" fechar={fechar}>
      {carga.fase === "carregando" && <p className="py-6 text-center text-[15px] text-texto-2">Carregando os modelos…</p>}

      {carga.fase === "erro" && (
        <>
          <Aviso tipo="info">{carga.texto}</Aviso>
          <Botao className="w-full" onClick={tentarDeNovo}>
            Tentar de novo
          </Botao>
        </>
      )}

      {carga.fase === "pronto" && modelos.length === 0 && (
        <p className="py-6 text-center text-[15px] text-texto-2">Nenhum modelo pronto por enquanto.</p>
      )}

      {carga.fase === "pronto" && modelos.length > 0 && (
        <>
          <p className="-mt-2 text-[15px] leading-snug text-texto-2">
            Treinos já montados. Ao adicionar, o treino vira seu: dá para mudar exercícios, séries e reps depois.
          </p>
          {erroAoAdicionar && <Aviso tipo="erro">{erroAoAdicionar}</Aviso>}
          <ul className="lista overflow-hidden rounded-xl bg-fundo">
            {modelos.map((modelo) => (
              <li key={modelo.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-semibold">{modelo.nome}</p>
                  <p className="mt-0.5 text-[14px] text-texto-2">{resumoDoTreino(modelo.exercicios)}</p>
                  <p className="mt-1 text-[14px] leading-snug text-texto-3">
                    {modelo.exercicios.map((i) => nomes?.get(i.exercicio_id) ?? "Exercício").join(", ")}
                  </p>
                </div>
                <Botao tamanho="pequeno" variante="fantasma" className="shrink-0" disabled={ocupado} onClick={() => void usar([modelo])}>
                  Adicionar
                </Botao>
              </li>
            ))}
          </ul>
          {modelos.length > 1 && (
            <Botao variante="principal" className="w-full" disabled={ocupado} onClick={() => void usar(modelos)}>
              {ocupado ? "Adicionando…" : "Adicionar todos"}
            </Botao>
          )}
        </>
      )}
    </Modal>
  );
}
