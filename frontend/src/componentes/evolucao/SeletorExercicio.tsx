// Escolha do exercício do gráfico de carga: um botão que abre uma lista com busca e filtro por
// grupo muscular (no lugar do <select> do navegador), e atalhos para os mais feitos.

import { useState } from "react";

import type { ResumoExercicio } from "../../lib/estatisticas";
import { formatarNumero } from "../../lib/formato";
import { acharMeta } from "../../lib/metas";
import type { Meta } from "../../lib/tipos";
import { Icone } from "../icones";
import { estiloEntrada, Modal } from "../ui";

/** Sem acento e em minúsculas, para a busca achar "supino" em "Supino" e "biceps" em "Bíceps". */
const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function Lista({
  resumos,
  escolhido,
  metas,
  escolher,
}: {
  resumos: ResumoExercicio[];
  escolhido: string;
  metas: Meta[];
  escolher: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState<string | null>(null);
  const grupos = [...new Set(resumos.map((r) => r.exercicio.grupo_muscular))].sort((a, b) => a.localeCompare(b));
  const termo = normalizar(busca.trim());
  const filtrados = resumos.filter(
    (r) => (!grupo || r.exercicio.grupo_muscular === grupo) && (!termo || normalizar(r.exercicio.nome).includes(termo)),
  );
  const porGrupo = grupos
    .map((g) => ({ grupo: g, itens: filtrados.filter((r) => r.exercicio.grupo_muscular === g) }))
    .filter((g) => g.itens.length);

  return (
    <div className="space-y-3">
      <input
        className={estiloEntrada}
        type="search"
        placeholder="Buscar exercício"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        aria-label="Buscar exercício"
      />
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Grupo muscular">
        {[null, ...grupos].map((g) => (
          <button
            key={g ?? "todos"}
            type="button"
            aria-pressed={grupo === g}
            onClick={() => setGrupo(g)}
            className={`h-9 shrink-0 rounded-lg px-3 text-[15px] ${grupo === g ? "bg-acento-forte font-semibold text-white" : "bg-campo text-texto"}`}
          >
            {g ?? "Todos"}
          </button>
        ))}
      </div>
      <div className="max-h-[52dvh] space-y-4 overflow-y-auto">
        {porGrupo.length === 0 && <p className="py-6 text-center text-[15px] text-texto-3">Nenhum exercício com esse nome.</p>}
        {porGrupo.map(({ grupo: g, itens }) => (
          <section key={g}>
            <h3 className="mb-1.5 text-[13px] font-semibold text-texto-2">{g}</h3>
            <ul className="lista overflow-hidden rounded-lg bg-campo">
              {itens.map((r) => {
                const atual = r.exercicio.id === escolhido;
                const comMeta = acharMeta(metas, "carga", r.exercicio.id);
                return (
                  <li key={r.exercicio.id}>
                    <button
                      type="button"
                      onClick={() => escolher(r.exercicio.id)}
                      aria-current={atual}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-linha"
                    >
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[17px] ${atual ? "font-semibold text-acento" : ""}`}>{r.exercicio.nome}</span>
                        <span className="block text-[13px] text-texto-2">
                          {r.treinos} {r.treinos === 1 ? "treino" : "treinos"} · recorde {formatarNumero(r.recorde.valor)} kg
                          {comMeta && ` · meta ${formatarNumero(comMeta.valor)} kg`}
                        </span>
                      </span>
                      {atual && <Icone nome="check" className="h-5 w-5 text-acento" strokeWidth={2.25} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function SeletorExercicio({
  resumos,
  escolhido,
  metas,
  escolher,
}: {
  resumos: ResumoExercicio[];
  escolhido: string;
  metas: Meta[];
  escolher: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = resumos.find((r) => r.exercicio.id === escolhido);
  const atalhos = resumos.slice(0, 5);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-haspopup="dialog"
        className="flex w-full items-center gap-3 rounded-lg bg-campo px-3 py-2.5 text-left active:opacity-75"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold">{atual?.exercicio.nome ?? "Escolha um exercício"}</span>
          {atual && (
            <span className="block text-[13px] text-texto-2">
              {atual.exercicio.grupo_muscular} · {atual.treinos} {atual.treinos === 1 ? "treino" : "treinos"}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[15px] font-medium text-acento">
          Trocar
          <Icone nome="abaixo" className="h-4 w-4" />
        </span>
      </button>
      {atalhos.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Mais feitos">
          {atalhos.map((r) => (
            <button
              key={r.exercicio.id}
              type="button"
              aria-pressed={r.exercicio.id === escolhido}
              onClick={() => escolher(r.exercicio.id)}
              className={`h-8 max-w-[11rem] shrink-0 truncate rounded-lg border px-2.5 text-[13px] ${r.exercicio.id === escolhido ? "border-acento bg-acento-suave font-semibold text-acento" : "border-linha text-texto-2"}`}
            >
              {r.exercicio.nome}
            </button>
          ))}
        </div>
      )}
      {aberto && (
        <Modal titulo="Escolha o exercício" fechar={() => setAberto(false)} posicao="baixo">
          <Lista
            resumos={resumos}
            escolhido={escolhido}
            metas={metas}
            escolher={(id) => {
              escolher(id);
              setAberto(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
