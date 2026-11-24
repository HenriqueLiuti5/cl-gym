import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

import { Aviso, Botao, Campo, Cartao, estiloEntrada, Titulo } from "../componentes/ui";
import { formatarData, lerNumero } from "../lib/formato";
import { api, ErroApi } from "../lib/api";
import { db, gravarMeta } from "../lib/db";
import { sair } from "../lib/sessao";
import { sincronizar, type EstadoSync } from "../lib/sync";
import { TABELAS, type Usuario } from "../lib/tipos";

function Metas({ usuario }: { usuario: Usuario }) {
  const texto = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
  const [kcal, setKcal] = useState(texto(usuario.meta_kcal));
  const [proteina, setProteina] = useState(texto(usuario.meta_proteina_g));
  const [peso, setPeso] = useState(texto(usuario.meta_peso_kg));
  const [mensagem, setMensagem] = useState<{ tipo: "bom" | "ruim"; texto: string } | null>(null);

  async function gravar() {
    try {
      const atualizado = await api<Usuario>("/conta", {
        metodo: "PATCH",
        corpo: { meta_kcal: lerNumero(kcal), meta_proteina_g: lerNumero(proteina), meta_peso_kg: lerNumero(peso) },
      });
      await gravarMeta("usuario", atualizado);
      setMensagem({ tipo: "bom", texto: "Metas salvas." });
    } catch (e) {
      const texto = e instanceof ErroApi && e.status === 0 ? "As metas precisam de internet para salvar." : "Confira os números.";
      setMensagem({ tipo: "ruim", texto });
    }
  }

  return (
    <Cartao className="space-y-3">
      <h2 className="font-semibold">Metas</h2>
      <div className="grid grid-cols-3 gap-2">
        <Campo rotulo="kcal/dia">
          <input className={estiloEntrada} inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </Campo>
        <Campo rotulo="Proteína (g)">
          <input className={estiloEntrada} inputMode="decimal" value={proteina} onChange={(e) => setProteina(e.target.value)} />
        </Campo>
        <Campo rotulo="Peso (kg)">
          <input className={estiloEntrada} inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} />
        </Campo>
      </div>
      {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}
      <Botao variante="principal" className="w-full" onClick={gravar}>
        Salvar metas
      </Botao>
    </Cartao>
  );
}

function Sincronizacao() {
  const estado = useLiveQuery(() => db.meta.get("estado_sync"), [])?.valor as EstadoSync | undefined;
  const pendentes = useLiveQuery(async () => {
    const contagens = await Promise.all(TABELAS.map((t) => db[t].where("pendente").equals(1).count()));
    return contagens.reduce((a, b) => a + b, 0);
  }, []);

  const texto = {
    ok: estado?.quando ? `Sincronizado em ${formatarData(estado.quando, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "Sincronizado",
    sincronizando: "Sincronizando…",
    offline: "Sem internet. Tudo fica salvo no celular.",
    erro: `Erro: ${estado?.mensagem ?? ""}`,
  }[estado?.situacao ?? "ok"];

  return (
    <Cartao className="space-y-3">
      <h2 className="font-semibold">Sincronização</h2>
      <p className="text-sm text-slate-300">{texto}</p>
      <p className="text-sm text-slate-400">
        {pendentes ? `${pendentes} alteração(ões) esperando para enviar.` : "Nada pendente."}
      </p>
      <Botao className="w-full" disabled={estado?.situacao === "sincronizando"} onClick={() => sincronizar()}>
        Sincronizar agora
      </Botao>
    </Cartao>
  );
}

async function exportar() {
  const dados = await api<unknown>("/conta/exportar");
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cl-gym-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function Conta({ usuario }: { usuario: Usuario }) {
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function apagarConta() {
    setErro(null);
    try {
      await api("/conta", { metodo: "DELETE" });
      await sair();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não deu para apagar. Tente de novo.");
    }
  }

  async function sairDaConta() {
    const contagens = await Promise.all(TABELAS.map((t) => db[t].where("pendente").equals(1).count()));
    const pendentes = contagens.reduce((a, b) => a + b, 0);
    const aviso = pendentes
      ? `Há ${pendentes} alteração(ões) que ainda não foram enviadas e vão se perder. Sair mesmo assim?`
      : "Sair desta conta neste celular?";
    if (confirm(aviso)) await sair();
  }

  return (
    <div className="space-y-4">
      <Titulo>Conta</Titulo>
      <Cartao>
        <p className="text-lg font-semibold">{usuario.nome ?? usuario.email}</p>
        <p className="text-sm text-slate-400">{usuario.email}</p>
      </Cartao>
      <Metas usuario={usuario} />
      <Sincronizacao />

      <Cartao className="space-y-2">
        <a href="#/instalar" className="block rounded-xl bg-slate-800 px-4 py-3 text-center">
          Como instalar no celular
        </a>
        <Botao className="w-full" onClick={() => exportar().catch((e: unknown) => setErro(e instanceof ErroApi ? e.message : String(e)))}>
          Exportar meus dados (JSON)
        </Botao>
        <Botao variante="fantasma" className="w-full" onClick={sairDaConta}>
          Sair
        </Botao>
      </Cartao>

      <Cartao className="space-y-3 border border-rose-900">
        <h2 className="font-semibold text-rose-300">Apagar minha conta</h2>
        <p className="text-sm text-slate-400">
          Apaga de verdade, no servidor e neste celular, todos os seus treinos, cargas e registros. Não tem volta.
          Se quiser, exporte os dados antes.
        </p>
        <Campo rotulo='Digite "APAGAR" para confirmar'>
          <input className={estiloEntrada} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
        </Campo>
        {erro && <Aviso tipo="ruim">{erro}</Aviso>}
        <Botao variante="perigo" className="w-full" disabled={confirmacao.trim().toUpperCase() !== "APAGAR"} onClick={apagarConta}>
          Apagar tudo
        </Botao>
      </Cartao>
    </div>
  );
}
