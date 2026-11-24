import { useState, type ChangeEvent } from "react";

import { api, ErroApi } from "../lib/api";
import { agora, db, gravarMeta, salvar } from "../lib/db";
import { formatarData } from "../lib/formato";
import { idRegistroDiario } from "../lib/ids";
import { lerPerfil, pesoAtual, type CamposPerfil, type DadosPerfil } from "../lib/perfil";
import { dataLocal } from "../lib/regras";
import type { RegistroDiario, Usuario } from "../lib/tipos";
import { Aviso, Botao, Campo, estiloEntrada } from "./ui";

const texto = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

/**
 * O peso (se mudou) entra no registro de hoje, que funciona offline e alimenta o gráfico.
 * Nome, altura e idade ficam na conta, no servidor.
 */
async function salvarPerfil(usuario: Usuario, dados: DadosPerfil, pesoAnterior: number | null) {
  if (dados.peso_kg !== pesoAnterior) {
    const data = dataLocal();
    const id = idRegistroDiario(usuario.id, data);
    const doDia = await db.registros_diarios.get(id);
    await salvar("registros_diarios", {
      ...(doDia ?? { id, data, kcal: null, proteina_g: null, observacao: null }),
      atualizado_em: agora(),
      excluido: false,
      peso_kg: dados.peso_kg,
    });
  }
  const { nome, altura_cm, idade } = dados;
  if (nome !== usuario.nome || altura_cm !== usuario.altura_cm || idade !== usuario.idade) {
    const atualizado = await api<Usuario>("/conta", { metodo: "PATCH", corpo: { nome, altura_cm, idade } });
    await gravarMeta("usuario", atualizado);
  }
}

export function FormularioPerfil({
  usuario,
  registros,
  rotulo,
  depois,
}: {
  usuario: Usuario;
  registros: RegistroDiario[];
  rotulo: string;
  /** Primeiro acesso: sem internet, deixa seguir e preencher depois. */
  depois?: () => void;
}) {
  const atual = pesoAtual(registros);
  const [campos, setCampos] = useState<CamposPerfil>({
    nome: usuario.nome ?? "",
    peso: texto(atual?.peso),
    altura: texto(usuario.altura_cm),
    idade: texto(usuario.idade),
  });
  const [situacao, setSituacao] = useState<"editando" | "salvando" | "salvo">("editando");
  const [erro, setErro] = useState<string | null>(null);
  const [semInternet, setSemInternet] = useState(false);

  function mudar(campo: keyof CamposPerfil) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      setCampos((c) => ({ ...c, [campo]: e.target.value }));
      setSituacao("editando");
      setErro(null);
    };
  }

  async function gravar() {
    const lido = lerPerfil(campos);
    if ("erro" in lido) {
      setErro(lido.erro);
      return;
    }
    setSituacao("salvando");
    try {
      await salvarPerfil(usuario, lido.dados, atual?.peso ?? null);
      setSituacao("salvo");
    } catch (e) {
      setSituacao("editando");
      const offline = e instanceof ErroApi && e.status === 0;
      setSemInternet(offline);
      if (offline) setErro("Sem internet agora. Nome, altura e idade precisam de internet para salvar.");
      else setErro(e instanceof ErroApi ? e.message : "Não deu para salvar. Tente de novo.");
    }
  }

  return (
    <div className="space-y-3">
      <Campo rotulo="Nome">
        <input className={estiloEntrada} value={campos.nome} onChange={mudar("nome")} maxLength={200} autoComplete="name" />
      </Campo>
      <div className="grid grid-cols-3 gap-2">
        <Campo rotulo="Peso (kg)">
          <input className={estiloEntrada} inputMode="decimal" value={campos.peso} onChange={mudar("peso")} placeholder="78,4" />
        </Campo>
        <Campo rotulo="Altura (cm)">
          <input className={estiloEntrada} inputMode="decimal" value={campos.altura} onChange={mudar("altura")} placeholder="175" />
        </Campo>
        <Campo rotulo="Idade">
          <input className={estiloEntrada} inputMode="numeric" value={campos.idade} onChange={mudar("idade")} placeholder="28" />
        </Campo>
      </div>
      {atual && (
        <p className="text-xs text-slate-500">
          Último peso lançado em {formatarData(atual.data)}. Um peso novo entra no registro de hoje.
        </p>
      )}
      {erro && <Aviso tipo="ruim">{erro}</Aviso>}
      <Botao variante="principal" className="w-full" disabled={situacao === "salvando"} onClick={gravar}>
        {situacao === "salvo" ? "Salvo ✓" : situacao === "salvando" ? "Salvando…" : rotulo}
      </Botao>
      {semInternet && depois && (
        <Botao variante="fantasma" className="w-full" onClick={depois}>
          Preencher depois
        </Botao>
      )}
    </div>
  );
}
