import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";

import { FormularioPerfil } from "../componentes/FormularioPerfil";
import { Icone } from "../componentes/icones";
import { LinhaInstalar } from "../componentes/Instalar";
import { Aviso, Botao, Campo, Cartao, Confirmar, estiloEntrada, estiloEntradaLinha, Grupo, Linha, LinhaCampo, Modal, Titulo } from "../componentes/ui";
import { api, ErroApi } from "../lib/api";
import { db, gravarMeta } from "../lib/db";
import { pontosDePeso } from "../lib/estatisticas";
import { formatarData, lerNumero } from "../lib/formato";
import { acharMeta, daTela, paraTela, removerMeta, salvarMeta, validarMeta } from "../lib/metas";
import { sair } from "../lib/sessao";
import { sincronizar, type EstadoSync } from "../lib/sync";
import { TABELAS, type Meta, type TipoMeta, type Usuario } from "../lib/tipos";

async function contarPendentes(): Promise<number> {
  const contagens = await Promise.all(TABELAS.map((t) => db[t].where("pendente").equals(1).count()));
  return contagens.reduce((a, b) => a + b, 0);
}

const alteracoes = (n: number) => `${n} ${n === 1 ? "alteração" : "alterações"}`;

const CAMPOS_META: { tipo: TipoMeta; rotulo: string; unidade: string }[] = [
  { tipo: "peso", rotulo: "Peso alvo", unidade: "kg" },
  { tipo: "treinos_semana", rotulo: "Treinos por semana", unidade: "" },
  { tipo: "kcal", rotulo: "Calorias por dia", unidade: "kcal" },
  { tipo: "proteina", rotulo: "Proteína por dia", unidade: "g" },
  { tipo: "carbo", rotulo: "Carboidrato por dia", unidade: "g" },
  { tipo: "agua", rotulo: "Água por dia", unidade: "L" },
];

function FormularioMetas({ usuario, metas, pesoAtual }: { usuario: Usuario; metas: Meta[]; pesoAtual: number | null }) {
  const [textos, setTextos] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      CAMPOS_META.map(({ tipo }) => {
        const meta = acharMeta(metas, tipo);
        return [tipo, meta ? String(paraTela(tipo, meta.valor)).replace(".", ",") : ""];
      }),
    ),
  );
  const [mensagem, setMensagem] = useState<{ tipo: "bom" | "ruim"; texto: string } | null>(null);

  async function gravar() {
    // Confere tudo antes de gravar qualquer coisa.
    const mudancas: { tipo: TipoMeta; valor: number | null; atual: Meta | null }[] = [];
    for (const { tipo, rotulo } of CAMPOS_META) {
      const texto = textos[tipo]!.trim();
      const atual = acharMeta(metas, tipo);
      const numero = lerNumero(texto);
      const valor = numero === null ? null : daTela(tipo, numero);
      if (texto && valor === null) return setMensagem({ tipo: "ruim", texto: `${rotulo}: digite um número.` });
      const erro = valor === null ? null : validarMeta(tipo, valor);
      if (erro) return setMensagem({ tipo: "ruim", texto: `${rotulo}: ${erro}` });
      if ((atual?.valor ?? null) !== valor) mudancas.push({ tipo, valor, atual });
    }
    for (const { tipo, valor, atual } of mudancas) {
      if (valor === null) await removerMeta(atual!);
      else await salvarMeta(usuario.id, tipo, valor, tipo === "peso" ? pesoAtual : null);
    }
    setMensagem({ tipo: "bom", texto: mudancas.length ? "Metas salvas." : "Nada mudou." });
  }

  return (
    <div className="space-y-4">
      <Grupo titulo="Metas" rodape="Deixe vazio para tirar a meta. A meta de carga de cada exercício fica na aba Evolução.">
        {CAMPOS_META.map(({ tipo, rotulo, unidade }) => (
          <LinhaCampo key={tipo} rotulo={rotulo} unidade={unidade}>
            <input
              className={`${estiloEntradaLinha} w-24`}
              inputMode={tipo === "kcal" || tipo === "treinos_semana" ? "numeric" : "decimal"}
              value={textos[tipo]}
              onChange={(e) => {
                setTextos((t) => ({ ...t, [tipo]: e.target.value }));
                setMensagem(null);
              }}
            />
          </LinhaCampo>
        ))}
      </Grupo>
      {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}
      <Botao variante="principal" className="w-full" onClick={() => void gravar()}>
        Salvar metas
      </Botao>
    </div>
  );
}

function Metas({ usuario }: { usuario: Usuario }) {
  const metas = useLiveQuery(() => db.metas.toArray(), []);
  const registros = useLiveQuery(() => db.registros_diarios.toArray(), []);
  if (!metas || !registros) return null;
  const pesos = pontosDePeso(registros);
  return <FormularioMetas usuario={usuario} metas={metas} pesoAtual={pesos[pesos.length - 1]?.media7 ?? null} />;
}

function Sincronizar() {
  const estado = useLiveQuery(() => db.meta.get("estado_sync"), [])?.valor as EstadoSync | undefined;
  const pendentes = useLiveQuery(contarPendentes, []);
  const sincronizando = estado?.situacao === "sincronizando";
  const ultima = estado?.quando
    ? formatarData(estado.quando, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "Ainda não";

  return (
    <Grupo
      titulo="Sincronização"
      rodape="Envia para a nuvem o que você registrou neste aparelho e baixa o que mudou nos outros. Já acontece sozinho ao abrir o app, depois de salvar, ao terminar um treino e quando a internet volta. Sem internet, tudo fica no aparelho até lá."
    >
      <Linha titulo="Última vez" direita={ultima} />
      <Linha titulo="Esperando para enviar" direita={pendentes === undefined ? "" : pendentes ? alteracoes(pendentes) : "Nada"} />
      <button
        type="button"
        disabled={sincronizando}
        onClick={() => void sincronizar()}
        className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-[17px] text-acento active:bg-campo disabled:opacity-50"
      >
        <Icone nome="sincronizar" className={`h-5 w-5 ${sincronizando ? "animate-spin" : ""}`} />
        {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
      </button>
    </Grupo>
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
      <p className="text-[15px] leading-snug text-texto-2">
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
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="grid grid-cols-2 gap-2">
        <Botao onClick={fechar}>Cancelar</Botao>
        <Botao variante="perigo" disabled={confirmacao.trim().toLowerCase() !== "apagar" || apagando} onClick={apagar}>
          {apagando ? "Apagando…" : "Apagar tudo"}
        </Botao>
      </div>
    </Modal>
  );
}

/** Entrada da área de administração (só para a conta do ADMIN_EMAIL). */
function LinhaAdministracao() {
  return (
    <Grupo>
      <a href="#/admin" className="flex min-h-12 w-full items-center gap-3 px-4 py-3 active:bg-campo">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-acento-suave text-acento">
          <Icone nome="escudo" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px]">Administração</span>
          <span className="mt-0.5 block text-[14px] leading-snug text-texto-2">Usuários e convites</span>
        </span>
        <Icone nome="avancar" className="-mr-1 h-5 w-5 text-texto-3" />
      </a>
    </Grupo>
  );
}

export function Conta({ usuario }: { usuario: Usuario }) {
  const registros = useLiveQuery(() => db.registros_diarios.toArray(), []);
  const [apagando, setApagando] = useState(false);
  // Quantas alterações ainda não foram enviadas, contadas ao pedir para sair.
  const [saindo, setSaindo] = useState<number | null>(null);
  const nome = usuario.nome?.trim() || usuario.email;

  // Com internet, traz a conta do servidor: chega o "admin" e o nome mudado em outro aparelho
  // sem precisar sair e entrar. Sem internet fica o que está guardado, sem aviso.
  useEffect(() => {
    if (navigator.onLine === false) return;
    let ativo = true;
    api<Usuario>("/conta")
      .then((conta) => (ativo ? gravarMeta("usuario", conta) : undefined))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div>
      <Titulo>Conta</Titulo>
      <div className="space-y-7">
        <Cartao className="flex items-center gap-3.5">
          <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-campo text-[22px] font-semibold text-texto-2">
            {Array.from(nome)[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[20px] leading-tight font-semibold">{nome}</p>
            {usuario.nome && <p className="mt-0.5 truncate text-[15px] text-texto-2">{usuario.email}</p>}
          </div>
        </Cartao>

        {usuario.admin && <LinhaAdministracao />}

        {registros && <FormularioPerfil usuario={usuario} registros={registros} rotulo="Salvar dados" titulo="Seus dados" />}
        <Metas usuario={usuario} />
        <Sincronizar />

        <Grupo>
          {/* Só aparece no navegador (some no app instalado). */}
          <LinhaInstalar />
          <Linha titulo="Sair desta conta" tom="acento" onClick={() => void contarPendentes().then(setSaindo)} />
          <Linha titulo="Apagar minha conta" tom="perigo" onClick={() => setApagando(true)} />
        </Grupo>
      </div>

      {saindo !== null && (
        <Confirmar
          titulo="Sair desta conta?"
          mensagem={
            saindo
              ? `Há ${alteracoes(saindo)} que ainda não foram enviadas e vão se perder.`
              : "O que já foi sincronizado fica guardado. Para voltar, é só entrar de novo."
          }
          rotulo="Sair"
          perigo={saindo > 0}
          confirmar={sair}
          fechar={() => setSaindo(null)}
        />
      )}
      {apagando && <ApagarConta fechar={() => setApagando(false)} />}
    </div>
  );
}
