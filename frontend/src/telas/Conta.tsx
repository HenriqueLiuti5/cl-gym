import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

import { FormularioPerfil } from "../componentes/FormularioPerfil";
import { Aviso, Botao, Campo, Cartao, estiloEntrada, Modal, Titulo } from "../componentes/ui";
import { api, ErroApi } from "../lib/api";
import { db, gravarMeta } from "../lib/db";
import { formatarData, lerNumero } from "../lib/formato";
import { sair } from "../lib/sessao";
import { sincronizar, type EstadoSync } from "../lib/sync";
import { TABELAS, type Usuario } from "../lib/tipos";

async function contarPendentes(): Promise<number> {
  const contagens = await Promise.all(TABELAS.map((t) => db[t].where("pendente").equals(1).count()));
  return contagens.reduce((a, b) => a + b, 0);
}

const alteracoes = (n: number) => `${n} ${n === 1 ? "alteração" : "alterações"}`;

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
      {/* items-end: se um rótulo quebrar em duas linhas (celular estreito), as caixas seguem alinhadas. */}
      <div className="grid grid-cols-3 items-end gap-2">
        <Campo rotulo="kcal/dia">
          <input className={estiloEntrada} inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </Campo>
        <Campo rotulo="Proteína (g)">
          <input className={estiloEntrada} inputMode="decimal" value={proteina} onChange={(e) => setProteina(e.target.value)} />
        </Campo>
        <Campo rotulo="Peso alvo (kg)">
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

function Sincronizar() {
  const estado = useLiveQuery(() => db.meta.get("estado_sync"), [])?.valor as EstadoSync | undefined;
  const pendentes = useLiveQuery(contarPendentes, []);
  const [ajuda, setAjuda] = useState(false);
  const sincronizando = estado?.situacao === "sincronizando";
  const ultima = estado?.quando
    ? formatarData(estado.quando, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center">
        <Botao tamanho="pequeno" disabled={sincronizando} onClick={() => void sincronizar()}>
          ↻ {sincronizando ? "Sincronizando…" : "Sincronizar"}
        </Botao>
        <button
          type="button"
          aria-label="O que o Sincronizar faz"
          aria-expanded={ajuda}
          onClick={() => setAjuda((a) => !a)}
          className="p-2"
        >
          <span className="grid h-4 w-4 place-items-center rounded-full border border-slate-500 text-[10px] leading-none font-bold text-slate-400">
            !
          </span>
        </button>
      </div>
      {ajuda && (
        <p className="rounded-xl bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-400">
          Envia para a nuvem o que você registrou neste aparelho e baixa o que mudou nos outros. Isso já acontece
          sozinho ao abrir o app, logo depois de salvar, ao terminar um treino e quando a internet volta (sem
          internet, fica tudo no aparelho até lá); o botão é para forçar agora.
          <span className="mt-1 block text-slate-500">
            {ultima && `Última vez: ${ultima}. `}
            {pendentes ? `${alteracoes(pendentes)} esperando para enviar.` : "Nada pendente."}
          </span>
        </p>
      )}
    </div>
  );
}

function ApagarConta({ fechar }: { fechar: () => void }) {
  const [confirmacao, setConfirmacao] = useState("");
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function apagar() {
    setApagando(true);
    setErro(null);
    try {
      await api("/conta", { metodo: "DELETE" });
      await sair();
    } catch (e) {
      setApagando(false);
      if (e instanceof ErroApi && e.status === 0) setErro("Precisa de internet para apagar a conta.");
      else setErro(e instanceof ErroApi ? e.message : "Não deu para apagar. Tente de novo.");
    }
  }

  return (
    <Modal titulo="Apagar minha conta" fechar={fechar}>
      <p className="text-sm text-slate-300">
        Apaga de verdade, no servidor e neste aparelho, todos os seus treinos, cargas e registros. Não tem volta.
      </p>
      <Campo rotulo='Digite "apagar" para confirmar'>
        <input
          className={estiloEntrada}
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </Campo>
      {erro && <Aviso tipo="ruim">{erro}</Aviso>}
      <div className="grid grid-cols-2 gap-2">
        <Botao onClick={fechar}>Cancelar</Botao>
        <Botao variante="perigo" disabled={confirmacao.trim().toLowerCase() !== "apagar" || apagando} onClick={apagar}>
          {apagando ? "Apagando…" : "Apagar tudo"}
        </Botao>
      </div>
    </Modal>
  );
}

export function Conta({ usuario }: { usuario: Usuario }) {
  const registros = useLiveQuery(() => db.registros_diarios.toArray(), []);
  const [apagando, setApagando] = useState(false);
  const nome = usuario.nome?.trim() || usuario.email;

  async function sairDaConta() {
    const pendentes = await contarPendentes();
    const aviso = pendentes
      ? `Há ${alteracoes(pendentes)} que ainda não foram enviadas e vão se perder. Sair mesmo assim?`
      : "Sair desta conta neste aparelho?";
    if (confirm(aviso)) await sair();
  }

  return (
    <div className="space-y-4">
      <Titulo>Conta</Titulo>
      <Cartao className="flex items-center gap-3">
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-500 text-xl font-bold text-slate-950">
          {Array.from(nome)[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-semibold">{nome}</p>
          {usuario.nome && <p className="truncate text-sm text-slate-400">{usuario.email}</p>}
        </div>
        <button type="button" onClick={sairDaConta} className="self-start px-1 text-xs text-slate-500 active:text-slate-300">
          Sair
        </button>
      </Cartao>

      <Cartao className="space-y-3">
        <h2 className="font-semibold">Seus dados</h2>
        {registros && <FormularioPerfil usuario={usuario} registros={registros} rotulo="Salvar" />}
      </Cartao>

      <Metas usuario={usuario} />
      <Sincronizar />

      <Botao variante="perigoLeve" tamanho="pequeno" className="w-full" onClick={() => setApagando(true)}>
        Apagar minha conta
      </Botao>
      {apagando && <ApagarConta fechar={() => setApagando(false)} />}
    </div>
  );
}
