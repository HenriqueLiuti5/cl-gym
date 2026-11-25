import { useLiveQuery } from "dexie-react-hooks";
import { useState, type ChangeEvent } from "react";

import { Icone } from "../componentes/icones";
import { Aviso, Botao, estiloEntradaLinha, Grupo, Linha, LinhaCampo, Titulo } from "../componentes/ui";
import { agora, db, salvar } from "../lib/db";
import { formatarData, formatarKg, formatarLitros, formatarNumero, lerNumero } from "../lib/formato";
import { idRegistroDiario } from "../lib/ids";
import { acharMeta, formatarMeta } from "../lib/metas";
import { dataLocal, somarDias } from "../lib/regras";
import { sincronizarEmBreve } from "../lib/sync";
import type { Meta, RegistroDiario, TipoMeta, Usuario } from "../lib/tipos";

const texto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

type Campos = { peso: string; kcal: string; proteina: string; carbo: string; agua: string; observacao: string };

/** Os mesmos limites do servidor (RegistroDiarioBase): fora deles o envio seria recusado. */
function lerCampos(c: Campos) {
  const n = {
    peso: lerNumero(c.peso),
    kcal: lerNumero(c.kcal),
    proteina: lerNumero(c.proteina),
    carbo: lerNumero(c.carbo),
    agua: lerNumero(c.agua),
  };
  const fora = (textoCampo: string, valor: number | null, min: number, max: number, inteiro = false) =>
    textoCampo.trim() !== "" && (valor === null || valor < min || valor > max || (inteiro && !Number.isInteger(valor)));
  const invalido =
    fora(c.peso, n.peso, 0.1, 500) ||
    fora(c.kcal, n.kcal, 0, 20000, true) ||
    fora(c.proteina, n.proteina, 0, 1000) ||
    fora(c.carbo, n.carbo, 0, 2000) ||
    fora(c.agua, n.agua, 0, 20);
  return { ...n, aguaMl: n.agua === null ? null : Math.round(n.agua * 1000), invalido };
}

function Formulario({ usuario, data, registro, metas }: { usuario: Usuario; data: string; registro?: RegistroDiario; metas: Meta[] }) {
  const [campos, setCampos] = useState<Campos>({
    peso: texto(registro?.peso_kg),
    kcal: texto(registro?.kcal),
    proteina: texto(registro?.proteina_g),
    carbo: texto(registro?.carbo_g),
    agua: registro?.agua_ml == null ? "" : texto(registro.agua_ml / 1000),
    observacao: registro?.observacao ?? "",
  });
  const [salvo, setSalvo] = useState(false);
  const lido = lerCampos(campos);

  const mudar = (campo: keyof Campos) => (e: ChangeEvent<HTMLInputElement>) => {
    setCampos((c) => ({ ...c, [campo]: e.target.value }));
    setSalvo(false);
  };
  const dica = (tipo: TipoMeta) => {
    const meta = acharMeta(metas, tipo);
    return meta ? `Meta: ${formatarMeta(tipo, meta.valor)}` : undefined;
  };

  async function gravar() {
    await salvar("registros_diarios", {
      id: idRegistroDiario(usuario.id, data),
      atualizado_em: agora(),
      excluido: false,
      data,
      peso_kg: lido.peso,
      kcal: lido.kcal,
      proteina_g: lido.proteina,
      carbo_g: lido.carbo,
      agua_ml: lido.aguaMl,
      observacao: campos.observacao.trim() || null,
    });
    sincronizarEmBreve();
    setSalvo(true);
  }

  /** Copo ou garrafa: soma na água do dia e já salva (o resto do formulário fica como está). */
  async function somarAgua(ml: number) {
    const total = Math.min(20000, (lido.aguaMl ?? registro?.agua_ml ?? 0) + ml);
    const id = idRegistroDiario(usuario.id, data);
    const doDia = await db.registros_diarios.get(id);
    await salvar("registros_diarios", {
      ...(doDia ?? { id, data, peso_kg: null, kcal: null, proteina_g: null, carbo_g: null, observacao: null }),
      atualizado_em: agora(),
      excluido: false,
      agua_ml: total,
    });
    sincronizarEmBreve();
    setCampos((c) => ({ ...c, agua: texto(total / 1000) }));
  }

  const numero = `${estiloEntradaLinha} w-24`;
  return (
    <div className="space-y-6">
      <Grupo titulo="Corpo">
        <LinhaCampo rotulo="Peso em jejum" unidade="kg" dica={dica("peso")}>
          <input className={numero} inputMode="decimal" value={campos.peso} onChange={mudar("peso")} placeholder="78,4" />
        </LinhaCampo>
      </Grupo>

      <Grupo titulo="Alimentação" rodape="Conte a comida no FatSecret (ou outro app) e lance aqui só o total do dia. Tudo é opcional.">
        <LinhaCampo rotulo="Calorias" unidade="kcal" dica={dica("kcal")}>
          <input className={numero} inputMode="numeric" value={campos.kcal} onChange={mudar("kcal")} />
        </LinhaCampo>
        <LinhaCampo rotulo="Proteína" unidade="g" dica={dica("proteina")}>
          <input className={numero} inputMode="decimal" value={campos.proteina} onChange={mudar("proteina")} />
        </LinhaCampo>
        <LinhaCampo rotulo="Carboidrato" unidade="g" dica={dica("carbo")}>
          <input className={numero} inputMode="decimal" value={campos.carbo} onChange={mudar("carbo")} />
        </LinhaCampo>
      </Grupo>

      <Grupo titulo="Água" rodape="Os botões somam na água do dia e já salvam.">
        <LinhaCampo rotulo="Água" unidade="L" dica={dica("agua")}>
          <input className={numero} inputMode="decimal" value={campos.agua} onChange={mudar("agua")} />
        </LinhaCampo>
        <div className="flex gap-2 px-4 py-3">
          {[250, 500, 1000].map((ml) => (
            <Botao key={ml} tamanho="pequeno" className="flex-1" onClick={() => void somarAgua(ml)}>
              +{ml < 1000 ? `${ml} ml` : "1 L"}
            </Botao>
          ))}
        </div>
      </Grupo>

      <Grupo titulo="Observação">
        <input
          className="h-12 w-full bg-transparent px-4 text-[17px] outline-none placeholder:text-texto-3"
          value={campos.observacao}
          maxLength={500}
          onChange={mudar("observacao")}
          placeholder="Ex.: jogo de basquete, festa, dormiu mal"
          aria-label="Observação"
        />
      </Grupo>

      {lido.invalido && <Aviso tipo="ruim">Confira os números: algum está fora do que dá para salvar.</Aviso>}
      <Botao variante="principal" className="w-full" disabled={lido.invalido} onClick={gravar}>
        {salvo ? (
          <>
            <Icone nome="check" className="h-5 w-5" />
            Salvo
          </>
        ) : (
          "Salvar"
        )}
      </Botao>
    </div>
  );
}

/** "Hoje", "Ontem" ou o dia da semana, com setas para o dia anterior e o seguinte. */
function SeletorDia({ data, mudar }: { data: string; mudar: (data: string) => void }) {
  const hoje = dataLocal();
  let nome = formatarData(data, { weekday: "long" });
  if (data === hoje) nome = "Hoje";
  else if (data === somarDias(hoje, -1)) nome = "Ontem";
  const seta = "grid h-11 w-11 shrink-0 place-items-center rounded-lg text-acento active:bg-campo disabled:text-texto-3 disabled:opacity-40";
  return (
    <div className="flex items-center gap-1 rounded-xl bg-superficie p-1">
      <button type="button" aria-label="Dia anterior" className={seta} onClick={() => mudar(somarDias(data, -1))}>
        <Icone nome="voltar" className="h-5.5 w-5.5" />
      </button>
      <label className="relative min-w-0 flex-1 text-center">
        <span className="block text-[17px] font-semibold first-letter:uppercase">{nome}</span>
        <span className="block text-[13px] text-texto-2">{formatarData(data, { day: "numeric", month: "long", year: "numeric" })}</span>
        {/* Por cima do texto, invisível: tocar abre o calendário do celular. */}
        <input
          type="date"
          aria-label="Escolher o dia"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={data}
          max={hoje}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker();
            } catch {
              // Navegador sem showPicker: o toque no campo já abre o calendário.
            }
          }}
          onChange={(e) => e.target.value && e.target.value <= hoje && mudar(e.target.value)}
        />
      </label>
      <button type="button" aria-label="Dia seguinte" className={seta} disabled={data >= hoje} onClick={() => mudar(somarDias(data, 1))}>
        <Icone nome="avancar" className="h-5.5 w-5.5" />
      </button>
    </div>
  );
}

function resumoDoDia(r: RegistroDiario): string {
  const partes = [
    r.peso_kg !== null && formatarKg(r.peso_kg),
    r.kcal !== null && `${formatarNumero(r.kcal, 0)} kcal`,
    r.proteina_g !== null && `${formatarNumero(r.proteina_g, 0)} g prot.`,
    r.carbo_g != null && `${formatarNumero(r.carbo_g, 0)} g carb.`,
    r.agua_ml != null && formatarLitros(r.agua_ml),
  ].filter(Boolean);
  return partes.join(" · ") || r.observacao || "";
}

export function Dia({ usuario }: { usuario: Usuario }) {
  const [data, setData] = useState(dataLocal());
  const registros = useLiveQuery(() => db.registros_diarios.orderBy("data").reverse().toArray(), []);
  const metas = useLiveQuery(() => db.metas.toArray(), []);
  if (!registros || !metas) return null;
  const ativos = registros.filter((r) => !r.excluido);
  const doDia = ativos.find((r) => r.data === data);

  return (
    <div>
      <Titulo>Registro do dia</Titulo>
      <div className="space-y-6">
        <SeletorDia data={data} mudar={setData} />
        <Formulario key={data} usuario={usuario} data={data} registro={doDia} metas={metas} />

        {ativos.length > 0 && (
          <Grupo titulo="Últimos dias" className="pt-2">
            {ativos.slice(0, 14).map((r) => (
              <Linha
                key={r.id}
                tom={r.data === data ? "acento" : "normal"}
                titulo={formatarData(r.data, { weekday: "short", day: "2-digit", month: "2-digit" })}
                subtitulo={resumoDoDia(r) || "Nada lançado"}
                onClick={() => {
                  setData(r.data);
                  window.scrollTo({ top: 0 });
                }}
              />
            ))}
          </Grupo>
        )}
      </div>
    </div>
  );
}
