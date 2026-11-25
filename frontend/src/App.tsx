import { useLiveQuery } from "dexie-react-hooks";
import { lazy, Suspense, useEffect, useState } from "react";

import { Icone, type NomeIcone } from "./componentes/icones";
import { Aviso } from "./componentes/ui";
import { lerToken } from "./lib/api";
import { db } from "./lib/db";
import { perfilIncompleto } from "./lib/perfil";
import { useRota } from "./lib/rota";
import { ligarSincronizacaoAutomatica, sincronizar, type EstadoSync } from "./lib/sync";
import type { Usuario } from "./lib/tipos";
import { BoasVindas } from "./telas/BoasVindas";
import { Conta } from "./telas/Conta";
import { Dia } from "./telas/Dia";
import { FichaTela } from "./telas/FichaTela";
import { Inicio } from "./telas/Inicio";
import { Login } from "./telas/Login";
import { Treino } from "./telas/Treino";

// Os gráficos (Recharts) só são baixados quando a tela abre.
const Graficos = lazy(() => import("./telas/Graficos").then((m) => ({ default: m.Graficos })));

const ABAS: { caminho: string; rotulo: string; icone: NomeIcone }[] = [
  { caminho: "", rotulo: "Treinos", icone: "halter" },
  { caminho: "dia", rotulo: "Dia", icone: "calendario" },
  { caminho: "graficos", rotulo: "Evolução", icone: "grafico" },
  { caminho: "conta", rotulo: "Conta", icone: "pessoa" },
];

function Navegacao({ atual }: { atual: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-linha bg-superficie pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {ABAS.map((aba) => {
          const ativa = aba.caminho === atual || (aba.caminho === "" && ["ficha", "treino"].includes(atual));
          return (
            <li key={aba.caminho}>
              <a
                href={`#/${aba.caminho}`}
                aria-current={ativa ? "page" : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${ativa ? "text-acento" : "text-texto-3"}`}
              >
                <Icone nome={aba.icone} className="h-6 w-6" />
                {aba.rotulo}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Só aparece em erro de verdade. Sem internet não avisa: tudo fica no celular e vai depois. */
function FaixaSync({ estado }: { estado?: EstadoSync }) {
  if (estado?.situacao === "erro") {
    return (
      <div className="mb-4">
        <Aviso tipo="erro" titulo="Não deu para sincronizar.">
          {estado.mensagem}
        </Aviso>
      </div>
    );
  }
  return null;
}

export function App() {
  const rota = useRota();
  const meta = useLiveQuery(async () => new Map((await db.meta.toArray()).map((m) => [m.chave, m.valor])), []);
  const usuario = meta?.get("usuario") as Usuario | undefined;
  const logado = Boolean(usuario && lerToken());
  // Quem escolheu "Preencher depois" (sem internet) no primeiro acesso, até fechar o app.
  const [perfilDepois, setPerfilDepois] = useState<string | null>(null);

  useEffect(() => {
    if (!logado) return;
    void sincronizar(); // ao abrir o app
    return ligarSincronizacaoAutomatica();
  }, [logado]);

  if (!meta) return null;
  const [tela, parametro] = rota;

  if (!logado || !usuario) return <Login expirou={meta.get("sessao_expirada") === true} />;
  if (perfilIncompleto(usuario) && perfilDepois !== usuario.id) {
    return <BoasVindas usuario={usuario} depois={() => setPerfilDepois(usuario.id)} />;
  }

  let conteudo;
  if (tela === "ficha" && parametro) conteudo = <FichaTela fichaId={parametro} />;
  else if (tela === "treino" && parametro) conteudo = <Treino sessaoId={parametro} />;
  else if (tela === "dia") conteudo = <Dia usuario={usuario} />;
  else if (tela === "graficos") conteudo = <Graficos usuario={usuario} aba={parametro} />;
  else if (tela === "conta") conteudo = <Conta usuario={usuario} />;
  else conteudo = <Inicio />;

  return (
    <main className="mx-auto max-w-md px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <FaixaSync estado={meta.get("estado_sync") as EstadoSync | undefined} />
      <Suspense fallback={<p className="py-10 text-center text-[15px] text-texto-3">Carregando…</p>}>{conteudo}</Suspense>
      <Navegacao atual={tela ?? ""} />
    </main>
  );
}
