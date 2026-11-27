// Janela "Trocar exercício" do treino: o planejado e o Plano B do item ("Na ficha") e os
// substitutos do catálogo ("Parecidos"). As opções saem de opcoesDeTroca (lib/troca.ts).

import type { UltimaVez } from "../lib/regras";
import { resumoUltimaVez, type OpcaoTroca } from "../lib/troca";
import { Icone } from "./icones";
import { Etiqueta, Modal } from "./ui";

function Opcoes({
  titulo,
  opcoes,
  atual,
  ultimaVezDe,
  escolher,
}: {
  titulo: string;
  opcoes: OpcaoTroca[];
  atual: string;
  ultimaVezDe: (exercicioId: string) => UltimaVez | null;
  escolher: (exercicioId: string) => void;
}) {
  if (opcoes.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1.5 text-[13px] font-semibold text-texto-2">{titulo}</h3>
      <ul className="lista overflow-hidden rounded-lg bg-campo">
        {opcoes.map(({ exercicio, origem }) => {
          const escolhido = exercicio.id === atual;
          const ultima = resumoUltimaVez(ultimaVezDe(exercicio.id));
          return (
            <li key={exercicio.id}>
              <button
                type="button"
                onClick={() => escolher(exercicio.id)}
                aria-current={escolhido || undefined}
                className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left active:bg-linha"
              >
                <span className="min-w-0 flex-1">
                  <span className={`block text-[17px] leading-snug ${escolhido ? "font-semibold text-acento" : ""}`}>
                    {exercicio.nome}
                    {origem === "planoB" && (
                      <>
                        {" "}
                        <Etiqueta>Plano B</Etiqueta>
                      </>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-texto-2">
                    {exercicio.grupo_muscular}
                    {ultima && ` · ${ultima}`}
                  </span>
                </span>
                {escolhido && <Icone nome="check" className="h-5 w-5 text-acento" strokeWidth={2.25} />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TrocarExercicio({
  opcoes,
  atual,
  ultimaVezDe,
  escolher,
  fechar,
}: {
  opcoes: OpcaoTroca[];
  /** O exercício na tela agora: fica marcado. */
  atual: string;
  ultimaVezDe: (exercicioId: string) => UltimaVez | null;
  escolher: (exercicioId: string) => void;
  fechar: () => void;
}) {
  const props = { atual, ultimaVezDe, escolher };
  return (
    <Modal titulo="Trocar exercício" fechar={fechar} posicao="baixo">
      <div className="max-h-[65dvh] space-y-4 overflow-y-auto overscroll-contain">
        <Opcoes titulo="Na ficha" opcoes={opcoes.filter((o) => o.origem !== "substituto")} {...props} />
        <Opcoes titulo="Parecidos" opcoes={opcoes.filter((o) => o.origem === "substituto")} {...props} />
      </div>
    </Modal>
  );
}
