import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";

import { FormularioPerfil } from "../componentes/FormularioPerfil";
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 px-1">
        <h1 className="text-[28px] leading-tight font-bold">Boas-vindas</h1>
        <p className="mt-1.5 text-[17px] leading-snug text-texto-2">
          Antes de começar, preencha seus dados. Dá para mudar depois, na aba Conta.
        </p>
      </div>
      <FormularioPerfil usuario={usuario} registros={registros} rotulo="Começar" depois={depois} />
    </main>
  );
}
