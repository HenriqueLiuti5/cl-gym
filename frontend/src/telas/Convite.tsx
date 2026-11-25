// Tela do link de convite (#/convite/<id>), antes de entrar: mostra até quando o convite vale,
// pede o código (que o admin manda junto com o link), confere e então o login com o Google cria
// a conta. Quem já tem conta entra pelo login normal.

import { useEffect, useState } from "react";

import { AvisoSaida, BotaoGoogle, CampoCodigo, FormularioDev, MolduraEntrada, type RespostaConvite } from "../componentes/Entrada";
import { Icone } from "../componentes/icones";
import { BotaoInstalar } from "../componentes/Instalar";
import { Aviso, Botao } from "../componentes/ui";
import { api, ErroApi } from "../lib/api";
import { formatarCodigo, mensagemSituacao, quandoVence } from "../lib/convite";
import { lerConvitePendente } from "../lib/convitePendente";
import { entrarComGoogle, entrarDev, recadoDoErro, useConfigLogin, type Recado } from "../lib/sessao";
import type { Saida } from "../lib/tipos";

type Situacao =
  | { fase: "carregando" }
  | { fase: "valido"; expira_em: string }
  | { fase: "invalido"; texto: string }
  | { fase: "offline" };

async function consultar(id: string): Promise<Situacao> {
  try {
    const resposta = await api<RespostaConvite>(`/convites/${encodeURIComponent(id)}`);
    return resposta.situacao === "valido"
      ? { fase: "valido", expira_em: resposta.expira_em }
      : { fase: "invalido", texto: mensagemSituacao(resposta.situacao) };
  } catch (e) {
    if (e instanceof ErroApi && e.status === 0) return { fase: "offline" };
    // 404, ou um link cortado no meio (o id nem é um UUID: 422).
    if (e instanceof ErroApi && (e.status === 404 || e.status === 422)) {
      return { fase: "invalido", texto: "Este convite não existe. Confira se o link veio inteiro." };
    }
    return { fase: "invalido", texto: e instanceof ErroApi ? e.message : "Não deu para abrir o convite." };
  }
}

export function Convite({ id, saida }: { id: string; saida?: Saida }) {
  const { config, erro: erroConfig } = useConfigLogin();
  const [situacao, setSituacao] = useState<Situacao>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  // Código já conferido neste aparelho: vai direto para o Google.
  const [convite, setConvite] = useState(() => lerConvitePendente());
  const [recado, setRecado] = useState<Recado | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let ativo = true;
    void consultar(id).then((nova) => {
      if (ativo) setSituacao(nova);
    });
    return () => {
      ativo = false;
    };
  }, [id, tentativa]);

  async function tentar(entrar: () => Promise<void>) {
    setCarregando(true);
    setRecado(null);
    try {
      await entrar();
    } catch (e) {
      setRecado(recadoDoErro(e));
      // O servidor recusou o convite (usado por outra pessoa, expirou...): pede o código de novo.
      if (e instanceof ErroApi && (e.motivo === "convite-invalido" || e.motivo === "sem-convite")) setConvite(null);
    } finally {
      setCarregando(false);
    }
  }

  const aviso = recado ?? (erroConfig ? { tipo: "erro" as const, texto: erroConfig } : null);

  let miolo;
  if (convite) {
    miolo = (
      <div className="space-y-3">
        <Aviso tipo="bom" titulo={`Código ${formatarCodigo(convite.codigo)} conferido.`}>
          Agora entre com o Google para criar sua conta.
        </Aviso>
        <BotaoGoogle
          clientId={config?.google_client_id ?? null}
          aoEntrar={(credencial) => void tentar(() => entrarComGoogle(credencial))}
          aoFalhar={(texto) => setRecado({ tipo: "erro", texto })}
        />
        <p className="text-center text-[13px] text-texto-3" aria-live="polite">
          {carregando ? "Entrando…" : `O convite vale até ${quandoVence(convite.expira_em)}.`}
        </p>
      </div>
    );
  } else if (situacao.fase === "carregando") {
    miolo = <p className="py-4 text-center text-[15px] text-texto-3">Conferindo o convite…</p>;
  } else if (situacao.fase === "valido") {
    miolo = (
      <div className="space-y-4">
        <p className="flex items-center justify-center gap-1.5 text-[15px] text-texto-2">
          <Icone nome="relogio" className="h-4.5 w-4.5" />
          Vale até {quandoVence(situacao.expira_em)}
        </p>
        <CampoCodigo rotulo="Continuar" aoConfirmar={setConvite} />
      </div>
    );
  } else if (situacao.fase === "offline") {
    miolo = (
      <div className="space-y-3">
        <Aviso tipo="info">Sem internet agora. Conecte-se para usar o convite.</Aviso>
        <Botao
          className="w-full"
          onClick={() => {
            setSituacao({ fase: "carregando" });
            setTentativa((n) => n + 1);
          }}
        >
          Tentar de novo
        </Botao>
      </div>
    );
  } else {
    miolo = <Aviso tipo="ruim">{situacao.texto}</Aviso>;
  }

  return (
    <MolduraEntrada titulo="Você foi convidado" frase="Para o CL Gym: treinos, cargas, peso e alimentação, mesmo sem internet.">
      <div className="space-y-3">
        {saida && saida.motivo !== "sessao-expirada" && <AvisoSaida saida={saida} />}
        {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
        {miolo}
      </div>

      <div className="mt-6">
        <BotaoInstalar />
      </div>

      <p className="mt-5 text-center">
        <a href="#/" className="inline-flex h-9 items-center rounded-lg px-3.5 text-[15px] font-medium text-acento active:bg-acento-suave">
          Já tenho conta
        </a>
      </p>

      {config?.login_dev && <FormularioDev ocupado={carregando} aoEntrar={(email) => void tentar(() => entrarDev(email))} />}
    </MolduraEntrada>
  );
}
