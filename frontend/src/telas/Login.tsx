import { useState } from "react";

import { AvisoSaida, BotaoGoogle, CampoCodigo, FormularioDev, MolduraEntrada } from "../componentes/Entrada";
import { Icone } from "../componentes/icones";
import { BotaoInstalar } from "../componentes/Instalar";
import { Aviso, Botao } from "../componentes/ui";
import { ErroApi } from "../lib/api";
import { formatarCodigo } from "../lib/convite";
import { lerConvitePendente } from "../lib/convitePendente";
import { entrarComGoogle, entrarDev, recadoDoErro, useConfigLogin, type Recado } from "../lib/sessao";
import type { Saida } from "../lib/tipos";

export function Login({ saida }: { saida?: Saida }) {
  const { config, erro: erroConfig } = useConfigLogin();
  const [recado, setRecado] = useState<Recado | null>(null);
  const [carregando, setCarregando] = useState(false);
  // Depois de tentar entrar, o aviso de por que tinha saído já cumpriu o papel.
  const [tentou, setTentou] = useState(false);
  const [convite, setConvite] = useState(() => lerConvitePendente());
  const [pedirCodigo, setPedirCodigo] = useState(false);

  async function tentar(entrar: () => Promise<void>) {
    setCarregando(true);
    setRecado(null);
    setTentou(true);
    try {
      await entrar();
    } catch (e) {
      setRecado(recadoDoErro(e));
      // Sem convite (ou com um que não serve): abre o campo do código.
      if (e instanceof ErroApi && (e.motivo === "sem-convite" || e.motivo === "convite-invalido")) {
        setConvite(null);
        setPedirCodigo(true);
      }
    } finally {
      setCarregando(false);
    }
  }

  const aviso = recado ?? (erroConfig ? { tipo: "erro" as const, texto: erroConfig } : null);

  return (
    <MolduraEntrada titulo="CL Gym" frase="Treinos, cargas, peso e alimentação. Funciona mesmo sem internet.">
      <div className="space-y-3">
        {!tentou && <AvisoSaida saida={saida} />}
        {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
        {convite && (
          <Aviso tipo="bom" titulo={`Convite ${formatarCodigo(convite.codigo)} conferido.`}>
            Agora entre com o Google para criar sua conta.
          </Aviso>
        )}
        <BotaoGoogle
          clientId={config?.google_client_id ?? null}
          aoEntrar={(credencial) => void tentar(() => entrarComGoogle(credencial))}
          aoFalhar={(texto) => setRecado({ tipo: "erro", texto })}
        />
        <p className="text-center text-[13px] text-texto-3" aria-live="polite">
          {carregando ? "Entrando…" : "Só entra quem foi convidado."}
        </p>
      </div>

      {!convite &&
        (pedirCodigo ? (
          <div className="mt-5">
            <CampoCodigo
              rotulo="Conferir"
              aoConfirmar={(novo) => {
                setConvite(novo);
                setPedirCodigo(false);
                setRecado(null);
              }}
              aoCancelar={() => setPedirCodigo(false)}
            />
          </div>
        ) : (
          <div className="mt-1 text-center">
            <Botao variante="fantasma" tamanho="pequeno" onClick={() => setPedirCodigo(true)}>
              <Icone nome="convite" className="h-4.5 w-4.5" />
              Tenho um convite
            </Botao>
          </div>
        ))}

      <div className="mt-6">
        <BotaoInstalar />
      </div>

      {config?.login_dev && <FormularioDev ocupado={carregando} aoEntrar={(email) => void tentar(() => entrarDev(email))} />}
    </MolduraEntrada>
  );
}
