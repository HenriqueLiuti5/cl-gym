// Administração: gerar convites (link + código de 8 caracteres, 24 h, uma pessoa) e acompanhar.

import { useState } from "react";

import {
  cancelarConvite,
  dataEHora,
  faltaParaExpirar,
  gerarConvite,
  listarConvites,
  separarConvites,
  textoDoLink,
  textoHistorico,
  valeAte,
  type ConviteAdmin,
} from "../../lib/admin";
import { linkDoConvite } from "../../lib/convite";
import { Icone } from "../icones";
import { Aviso, Botao, Cartao, Etiqueta, Grupo, Linha, Modal } from "../ui";
import { mensagemDeErro, useAgora, useCarregar } from "./carregar";
import { BarraAtualizar, SemDados } from "./Partes";

type Recado = { tipo: "bom" | "erro"; texto: string };

/** Código grande, validade e os jeitos de mandar (link e código vão separados). */
function DetalhesConvite({ c, agora, cancelar }: { c: ConviteAdmin; agora: number; cancelar: () => void }) {
  const [recado, setRecado] = useState<Recado | null>(null);
  const link = linkDoConvite(c.id);
  const codigo = c.codigo ?? "";

  async function copiar(texto: string, feito: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setRecado({ tipo: "bom", texto: feito });
    } catch {
      setRecado({ tipo: "erro", texto: "Não deu para copiar. Segure o dedo sobre o código para copiar à mão." });
    }
  }

  async function enviarLink() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Convite para o CL Gym", text: textoDoLink(link) });
        setRecado(null);
        return;
      } catch (e) {
        // Fechou a janela de compartilhar: não faz nada. Outro erro: copia o link.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copiar(link, "Link copiado. Cole na conversa com a pessoa.");
  }

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-[13px] font-semibold text-texto-2">Código</p>
        <p className="mt-0.5 text-[34px] leading-tight font-bold tracking-[0.08em] tabular-nums select-all">{codigo}</p>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-[15px] text-texto-2">
          <Icone nome="relogio" className="h-4.5 w-4.5" />
          {valeAte(c.expira_em, agora)}
        </p>
      </div>
      <Botao variante="principal" className="w-full" onClick={() => void enviarLink()}>
        <Icone nome="compartilhar" className="h-5 w-5" />
        Enviar link
      </Botao>
      <div className="grid grid-cols-2 gap-2">
        <Botao onClick={() => void copiar(codigo, "Código copiado.")}>Copiar código</Botao>
        <Botao onClick={() => void copiar(link, "Link copiado.")}>Copiar link</Botao>
      </div>
      {recado && <Aviso tipo={recado.tipo}>{recado.texto}</Aviso>}
      <Botao variante="perigoLeve" tamanho="pequeno" className="w-full" onClick={cancelar}>
        Cancelar este convite
      </Botao>
    </div>
  );
}

/** Pergunta antes de cancelar ("Manter" no lugar do "Cancelar" do Confirmar, que confundiria). */
function CancelarConvite({ c, fechar, cancelado }: { c: ConviteAdmin; fechar: () => void; cancelado: (c: ConviteAdmin) => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function cancelar() {
    setOcupado(true);
    setErro(null);
    try {
      cancelado(await cancelarConvite(c.id));
    } catch (e) {
      setOcupado(false);
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <Modal titulo="Cancelar este convite?" fechar={fechar}>
      <p className="text-[15px] leading-snug text-texto-2">
        O código {c.codigo} deixa de valer na hora. Quem tentar usar vai ver que o convite foi cancelado.
      </p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="grid grid-cols-2 gap-2">
        <Botao onClick={fechar}>Manter</Botao>
        <Botao variante="perigo" disabled={ocupado} onClick={() => void cancelar()}>
          {ocupado ? "Cancelando…" : "Cancelar convite"}
        </Botao>
      </div>
    </Modal>
  );
}

export function AdminConvites() {
  const { dados, erro, carregando, quando, recarregar } = useCarregar(listarConvites);
  const agora = Math.max(useAgora(), quando ?? 0);
  const [novo, setNovo] = useState<ConviteAdmin | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erroGerar, setErroGerar] = useState<string | null>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<ConviteAdmin | null>(null);
  // Respostas do servidor por cima da lista, até chegar uma lista mais nova.
  const [trocados, setTrocados] = useState<Record<string, { c: ConviteAdmin; em: number }>>({});

  async function gerar() {
    setGerando(true);
    setErroGerar(null);
    try {
      const convite = await gerarConvite();
      setTrocados((t) => ({ ...t, [convite.id]: { c: convite, em: Date.now() } }));
      setNovo(convite);
      recarregar();
    } catch (e) {
      setErroGerar(mensagemDeErro(e));
    } finally {
      setGerando(false);
    }
  }

  if (!dados) return <SemDados erro={erro} tentar={recarregar} />;

  const maisNovo = (id: string) => {
    const trocado = trocados[id];
    return trocado && trocado.em > (quando ?? 0) ? trocado.c : undefined;
  };
  const lista = dados.map((c) => maisNovo(c.id) ?? c);
  for (const { c } of Object.values(trocados)) {
    if (!lista.some((x) => x.id === c.id) && maisNovo(c.id)) lista.push(c);
  }
  const { validos, historico } = separarConvites(lista, agora);
  const destaque = novo ? validos.find((c) => c.id === novo.id) : undefined;
  const esperando = validos.filter((c) => c.id !== destaque?.id);
  const aberto = validos.find((c) => c.id === abertoId);

  return (
    <div>
      <BarraAtualizar quando={quando} carregando={carregando} atualizar={recarregar} />
      <div className="space-y-6">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="space-y-2">
          <Botao variante="principal" className="w-full" disabled={gerando} onClick={() => void gerar()}>
            <Icone nome="convite" className="h-5 w-5" />
            {gerando ? "Gerando…" : "Gerar convite"}
          </Botao>
          {erroGerar && <Aviso tipo="erro">{erroGerar}</Aviso>}
          <p className="px-1 text-[13px] leading-snug text-texto-3">
            Cada convite vale por 24 horas e para uma pessoa só. Mande o link e o código: ela abre o link, digita o código e
            entra com o Google. Quem já tem conta entra sem convite.
          </p>
        </div>

        {destaque && (
          <Cartao className="space-y-3 ring-2 ring-acento">
            <div className="flex items-center justify-between">
              <Etiqueta tom="acento">Convite novo</Etiqueta>
              <button
                type="button"
                aria-label="Fechar o destaque"
                onClick={() => setNovo(null)}
                className="-my-1 -mr-1 grid h-8 w-8 place-items-center rounded-full bg-campo text-texto-2"
              >
                <Icone nome="fechar" className="h-4 w-4" />
              </button>
            </div>
            <DetalhesConvite c={destaque} agora={agora} cancelar={() => setCancelando(destaque)} />
          </Cartao>
        )}

        {esperando.length > 0 && (
          <Grupo titulo="Esperando uso" rodape="Toque para mandar de novo ou cancelar.">
            {esperando.map((c) => (
              <Linha
                key={c.id}
                titulo={<span className="font-semibold tracking-[0.06em] tabular-nums">{c.codigo}</span>}
                subtitulo={faltaParaExpirar(c.expira_em, agora)}
                onClick={() => setAbertoId(c.id)}
                seta
              />
            ))}
          </Grupo>
        )}

        {!destaque && esperando.length === 0 && (
          <p className="px-1 text-[15px] text-texto-3">Nenhum convite esperando uso.</p>
        )}

        {historico.length > 0 && (
          <Grupo titulo="Histórico" rodape="Convites dos últimos 30 dias. O código some quando o convite é usado, expira ou é cancelado.">
            {historico.map((c) => (
              <Linha key={c.id} titulo={textoHistorico(c, agora)} subtitulo={`Criado em ${dataEHora(c.criado_em, agora)}`} />
            ))}
          </Grupo>
        )}
      </div>

      {aberto && (
        <Modal titulo="Convite" posicao="baixo" fechar={() => setAbertoId(null)}>
          <DetalhesConvite key={aberto.id} c={aberto} agora={agora} cancelar={() => setCancelando(aberto)} />
        </Modal>
      )}
      {cancelando && (
        <CancelarConvite
          c={cancelando}
          fechar={() => setCancelando(null)}
          cancelado={(atualizado) => {
            setTrocados((t) => ({ ...t, [atualizado.id]: { c: atualizado, em: Date.now() } }));
            setCancelando(null);
            setAbertoId(null);
            if (novo?.id === atualizado.id) setNovo(null);
            recarregar();
          }}
        />
      )}
    </div>
  );
}
