// Administração: quem usa o app (só atividade), com bloquear, desbloquear e excluir conta.

import { useState } from "react";

import {
  ativoAgora,
  bloquearUsuario,
  dataCurta,
  dataEHora,
  desbloquearUsuario,
  excluirUsuario,
  listarUsuarios,
  nomeDe,
  ordenarUsuarios,
  plural,
  resumirUsuarios,
  rotuloAparelho,
  tempoRelativo,
  textoVisto,
  type UsuarioAdmin,
} from "../../lib/admin";
import type { Usuario } from "../../lib/tipos";
import { Icone } from "../icones";
import { Aviso, Botao, Campo, Cartao, Confirmar, Etiqueta, estiloEntrada, Modal } from "../ui";
import { mensagemDeErro, useAgora, useCarregar } from "./carregar";
import { Avatar, BarraAtualizar, Info, ListaComAvatar, SemDados } from "./Partes";

function Situacao({ u, agora }: { u: UsuarioAdmin; agora: number }) {
  const ativo = ativoAgora(u.visto_em, agora);
  return (
    <span className={`flex items-center gap-1.5 ${ativo ? "font-medium text-sucesso" : ""}`}>
      {ativo && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-sucesso" />}
      {textoVisto(u.visto_em, agora)}
    </span>
  );
}

function LinhaPessoa({ u, voce, agora, abrir }: { u: UsuarioAdmin; voce: boolean; agora: number; abrir: () => void }) {
  const nome = nomeDe(u);
  return (
    <button type="button" onClick={abrir} className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-campo">
      <Avatar nome={nome} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[17px]">{nome}</span>
          {voce && <Etiqueta>Você</Etiqueta>}
          {u.bloqueado && <Etiqueta tom="aviso">Bloqueado</Etiqueta>}
        </span>
        <span className="mt-0.5 block text-[14px] text-texto-2">
          <Situacao u={u} agora={agora} />
        </span>
      </span>
      <span className="shrink-0 text-[15px] text-texto-2 tabular-nums">{plural(u.treinos, "treino", "treinos")}</span>
      <Icone nome="avancar" className="-mr-1 h-5 w-5 text-texto-3" />
    </button>
  );
}

function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[24px] leading-tight font-bold tabular-nums">{valor.toLocaleString("pt-BR")}</p>
      <p className="text-[13px] leading-snug text-texto-2">{rotulo}</p>
    </div>
  );
}

function ExcluirConta({ u, fechar, excluida }: { u: UsuarioAdmin; fechar: () => void; excluida: () => void }) {
  const [confirmacao, setConfirmacao] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function excluir() {
    setExcluindo(true);
    setErro(null);
    try {
      await excluirUsuario(u.id);
      excluida();
    } catch (e) {
      setExcluindo(false);
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <Modal titulo={`Excluir a conta de ${nomeDe(u)}?`} fechar={fechar}>
      <p className="text-[15px] leading-snug text-texto-2">
        Apaga de verdade, no servidor, todos os treinos, cargas e registros dessa pessoa. Não tem volta. No celular dela, o app sai da
        conta na próxima vez que falar com o servidor, e para voltar ela vai precisar de um convite novo.
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
        <Botao variante="perigo" disabled={confirmacao.trim().toLowerCase() !== "apagar" || excluindo} onClick={excluir}>
          {excluindo ? "Excluindo…" : "Excluir tudo"}
        </Botao>
      </div>
    </Modal>
  );
}

function DetalheUsuario({
  u,
  voce,
  agora,
  fechar,
  mudou,
  excluida,
}: {
  u: UsuarioAdmin;
  voce: boolean;
  agora: number;
  fechar: () => void;
  /** Bloqueou ou desbloqueou: a lista atualiza com a resposta do servidor. */
  mudou: (atualizado: UsuarioAdmin) => void;
  excluida: () => void;
}) {
  const [confirmando, setConfirmando] = useState<"bloquear" | "excluir" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<{ tipo: "bom" | "erro"; texto: string } | null>(null);
  const nome = nomeDe(u);

  async function trocarBloqueio(bloquear: boolean) {
    setOcupado(true);
    setRecado(null);
    try {
      const atualizado = bloquear ? await bloquearUsuario(u.id) : await desbloquearUsuario(u.id);
      mudou(atualizado);
      setRecado({ tipo: "bom", texto: bloquear ? "Acesso bloqueado." : "Acesso liberado de novo." });
    } catch (e) {
      setRecado({ tipo: "erro", texto: mensagemDeErro(e) });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Modal titulo={nome} fechar={fechar} posicao="baixo">
        <div className="-mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-texto-2">
          <Situacao u={u} agora={agora} />
          {voce && <Etiqueta>Você</Etiqueta>}
          {u.bloqueado && <Etiqueta tom="aviso">Bloqueado</Etiqueta>}
        </div>

        <dl>
          <Info rotulo="E-mail">
            <span className="break-all">{u.email}</span>
          </Info>
          <Info rotulo="No app desde">{dataCurta(u.criado_em, agora)}</Info>
          <Info rotulo="Visto por último">
            {u.visto_em ? `${dataEHora(u.visto_em, agora)} · ${tempoRelativo(u.visto_em, agora)}` : "Nunca abriu"}
          </Info>
          <Info rotulo="Aparelho">{rotuloAparelho(u) ?? "Ainda não registrado"}</Info>
          <Info rotulo="Treinos">{`${u.treinos.toLocaleString("pt-BR")} no total · ${u.treinos_30d.toLocaleString("pt-BR")} em 30 dias`}</Info>
          <Info rotulo="Último treino">
            {u.ultimo_treino ? `${dataCurta(u.ultimo_treino, agora)} · ${tempoRelativo(u.ultimo_treino, agora)}` : "Nenhum ainda"}
          </Info>
          {u.bloqueado && u.bloqueado_em && <Info rotulo="Bloqueado desde">{dataEHora(u.bloqueado_em, agora)}</Info>}
        </dl>

        {recado && <Aviso tipo={recado.tipo}>{recado.texto}</Aviso>}

        {voce ? (
          <p className="text-[13px] leading-snug text-texto-3">Esta é a sua conta. Para mudar algo nela, use a aba Conta.</p>
        ) : (
          <div className="space-y-2">
            {u.bloqueado ? (
              <Botao className="w-full" disabled={ocupado} onClick={() => void trocarBloqueio(false)}>
                <Icone nome="cadeado" className="h-5 w-5" />
                {ocupado ? "Liberando…" : "Desbloquear acesso"}
              </Botao>
            ) : (
              <Botao className="w-full" disabled={ocupado} onClick={() => setConfirmando("bloquear")}>
                <Icone nome="cadeado" className="h-5 w-5" />
                {ocupado ? "Bloqueando…" : "Bloquear acesso"}
              </Botao>
            )}
            <Botao variante="perigoLeve" className="w-full" disabled={ocupado} onClick={() => setConfirmando("excluir")}>
              <Icone nome="lixeira" className="h-5 w-5" />
              Excluir conta
            </Botao>
          </div>
        )}
      </Modal>

      {confirmando === "bloquear" && (
        <Confirmar
          titulo={`Bloquear o acesso de ${nome}?`}
          mensagem="A pessoa sai da conta na próxima vez que o app dela falar com o servidor e não consegue entrar de novo. Os treinos e registros ficam guardados, e você pode desbloquear quando quiser."
          rotulo="Bloquear"
          perigo
          confirmar={() => trocarBloqueio(true)}
          fechar={() => setConfirmando(null)}
        />
      )}
      {confirmando === "excluir" && <ExcluirConta u={u} fechar={() => setConfirmando(null)} excluida={excluida} />}
    </>
  );
}

export function AdminUsuarios({ usuario }: { usuario: Usuario }) {
  const { dados, erro, carregando, quando, recarregar } = useCarregar(listarUsuarios);
  const agora = Math.max(useAgora(), quando ?? 0);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  // Resposta de bloquear/desbloquear, por cima da lista até chegar uma lista mais nova.
  const [trocados, setTrocados] = useState<Record<string, { u: UsuarioAdmin; em: number }>>({});
  const [excluido, setExcluido] = useState<string | null>(null);

  if (!dados) return <SemDados erro={erro} tentar={recarregar} />;

  const usuarios = ordenarUsuarios(
    dados.map((u) => {
      const trocado = trocados[u.id];
      return trocado && trocado.em > (quando ?? 0) ? trocado.u : u;
    }),
  );
  const resumo = resumirUsuarios(usuarios, agora);
  const aberto = usuarios.find((u) => u.id === abertoId);

  return (
    <div>
      <BarraAtualizar quando={quando} carregando={carregando} atualizar={recarregar} />
      <div className="space-y-6">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {excluido && <Aviso tipo="bom">{`A conta de ${excluido} foi excluída.`}</Aviso>}

        <Cartao className="grid grid-cols-3 gap-3">
          <Numero valor={resumo.pessoas} rotulo={resumo.pessoas === 1 ? "pessoa" : "pessoas"} />
          <Numero valor={resumo.usaramHoje} rotulo={resumo.usaramHoje === 1 ? "usou hoje" : "usaram hoje"} />
          <Numero valor={resumo.treinos30d} rotulo="treinos em 30 dias" />
        </Cartao>

        {usuarios.length ? (
          <ListaComAvatar
            titulo="Pessoas"
            rodape={`Só a atividade de cada um: nada de peso, alimentação ou cargas. "Ativo agora" é quem abriu o app nos últimos 10 minutos.${
              resumo.bloqueados ? ` ${plural(resumo.bloqueados, "conta bloqueada", "contas bloqueadas")}.` : ""
            }`}
          >
            {usuarios.map((u) => (
              <LinhaPessoa key={u.id} u={u} voce={u.id === usuario.id} agora={agora} abrir={() => setAbertoId(u.id)} />
            ))}
          </ListaComAvatar>
        ) : (
          <p className="py-6 text-center text-[15px] text-texto-3">Ninguém entrou ainda. Gere um convite na aba Convites.</p>
        )}
      </div>

      {aberto && (
        <DetalheUsuario
          key={aberto.id}
          u={aberto}
          voce={aberto.id === usuario.id}
          agora={agora}
          fechar={() => setAbertoId(null)}
          mudou={(atualizado) => {
            setTrocados((t) => ({ ...t, [atualizado.id]: { u: atualizado, em: Date.now() } }));
            recarregar();
          }}
          excluida={() => {
            setExcluido(nomeDe(aberto));
            setAbertoId(null);
            recarregar();
          }}
        />
      )}
    </div>
  );
}
