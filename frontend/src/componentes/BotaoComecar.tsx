import { useState, type ReactNode } from "react";

import { db } from "../lib/db";
import { comecarTreino, treinoEmAndamento } from "../lib/treino";
import { Botao, Confirmar } from "./ui";

/** Começa o treino da ficha. Se já houver um em andamento, pergunta antes. */
export function BotaoComecar({
  fichaId,
  variante = "principal",
  className = "",
  children = "Começar treino",
}: {
  fichaId: string;
  variante?: "principal" | "secundario";
  className?: string;
  children?: ReactNode;
}) {
  const [aberto, setAberto] = useState<string | null>(null);

  async function comecar() {
    const sessao = await treinoEmAndamento();
    if (!sessao) return comecarTreino(fichaId);
    const ficha = sessao.ficha_id ? await db.fichas.get(sessao.ficha_id) : undefined;
    setAberto(ficha?.nome ?? "Treino avulso");
  }

  return (
    <>
      <Botao variante={variante} className={className} onClick={() => void comecar()}>
        {children}
      </Botao>
      {aberto !== null && (
        <Confirmar
          titulo="Já tem um treino em andamento"
          mensagem={`O treino de ${aberto} continua salvo e dá para voltar nele pela tela de treinos. Começar outro mesmo assim?`}
          rotulo="Começar outro"
          confirmar={() => comecarTreino(fichaId)}
          fechar={() => setAberto(null)}
        />
      )}
    </>
  );
}
