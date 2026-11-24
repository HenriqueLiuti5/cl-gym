import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";

import { FormularioPerfil } from "../componentes/FormularioPerfil";
import { Cartao } from "../componentes/ui";
import { api } from "../lib/api";
import { db, gravarMeta } from "../lib/db";
import { perfilIncompleto } from "../lib/perfil";
import type { Usuario } from "../lib/tipos";

/** Primeiro acesso: pede nome, peso, altura e idade antes de mostrar o app. */
export function BoasVindas({ usuario, depois }: { usuario: Usuario; depois: () => void }) {
  const registros = useLiveQuery(() => db.registros_diarios.toArray(), []);

  useEffect(() => {
    // Perfil já preenchido em outro aparelho: o servidor tem, então não pergunta de novo.
    api<Usuario>("/conta")
      .then((conta) => (perfilIncompleto(conta) ? undefined : gravarMeta("usuario", conta)))
      .catch(() => undefined);
  }, []);

  if (!registros) return null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="text-center">
        <img src="/icone.svg" alt="" className="mx-auto mb-4 h-16 w-16" />
        <h1 className="text-2xl font-bold">Boas-vindas ao CL Gym</h1>
        <p className="mt-2 text-slate-400">
          Antes de começar, conte um pouco sobre você. Dá para mudar depois, na aba Conta.
        </p>
      </div>
      <Cartao>
        <FormularioPerfil usuario={usuario} registros={registros} rotulo="Começar" depois={depois} />
      </Cartao>
    </main>
  );
}
