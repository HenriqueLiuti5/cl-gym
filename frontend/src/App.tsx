import { useLiveQuery } from "dexie-react-hooks";
import { lazy, Suspense, useEffect, useState } from "react";

import { lerToken } from "./lib/api";
import { db } from "./lib/db";
import { perfilIncompleto } from "./lib/perfil";
import { useRota } from "./lib/rota";
import { sincronizar, sincronizarQuandoVoltarInternet, type EstadoSync } from "./lib/sync";
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

const ABAS = [
  { caminho: "", rotulo: "Treinos", icone: "🏋️" },
  { caminho: "dia", rotulo: "Dia", icone: "⚖️" },
  { caminho: "graficos", rotulo: "Evolução", icone: "📈" },
  { caminho: "conta", rotulo: "Conta", icone: "👤" },
];

function Navegacao({ atual }: { atual: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {ABAS.map((aba) => {
          const ativa = aba.caminho === atual || (aba.caminho === "" && ["ficha", "treino"].includes(atual));
          return (
            <li key={aba.caminho}>
              <a href={`#/${aba.caminho}`} className={`flex flex-col items-center py-2 text-xs ${ativa ? "text-emerald-400" : "text-slate-400"}`}>
                <span className="text-xl" aria-hidden>
                  {aba.icone}
                </span>
                {aba.rotulo}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function FaixaSync({ estado }: { estado?: EstadoSync }) {
  if (estado?.situacao === "offline") {
    return <p className="mb-3 rounded-xl bg-slate-800 px-3 py-2 text-center text-xs text-slate-300">{estado.mensagem ?? "Sem internet: tudo fica salvo no celular."}</p>;
  }
  if (estado?.situacao === "erro") {
    return <p className="mb-3 rounded-xl bg-amber-950 px-3 py-2 text-center text-xs text-amber-300">Não deu para sincronizar: {estado.mensagem}</p>;
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
    return sincronizarQuandoVoltarInternet();
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
  else if (tela === "graficos") conteudo = <Graficos usuario={usuario} />;
  else if (tela === "conta") conteudo = <Conta usuario={usuario} />;
  else conteudo = <Inicio usuario={usuario} />;

  return (
    <main className="mx-auto max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
      <FaixaSync estado={meta.get("estado_sync") as EstadoSync | undefined} />
      <Suspense fallback={<p className="text-slate-400">Carregando…</p>}>{conteudo}</Suspense>
      <Navegacao atual={tela ?? ""} />
    </main>
  );
}
