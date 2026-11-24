import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

import { Aviso, Botao, Campo, Cartao, estiloEntrada, Titulo } from "../componentes/ui";
import { formatarData, formatarKg, lerNumero } from "../lib/formato";
import { agora, db, salvar } from "../lib/db";
import { idRegistroDiario } from "../lib/ids";
import { dataLocal } from "../lib/regras";
import type { RegistroDiario, Usuario } from "../lib/tipos";

function Formulario({ usuario, data, registro }: { usuario: Usuario; data: string; registro?: RegistroDiario }) {
  const texto = (n: number | null | undefined) =>
    n === null || n === undefined ? "" : String(n).replace(".", ",");
  const [peso, setPeso] = useState(texto(registro?.peso_kg));
  const [kcal, setKcal] = useState(texto(registro?.kcal));
  const [proteina, setProteina] = useState(texto(registro?.proteina_g));
  const [observacao, setObservacao] = useState(registro?.observacao ?? "");
  const [salvo, setSalvo] = useState(false);

  const valores = { peso: lerNumero(peso), kcal: lerNumero(kcal), proteina: lerNumero(proteina) };
  const invalido =
    (peso.trim() !== "" && (valores.peso === null || valores.peso <= 0 || valores.peso > 500)) ||
    (kcal.trim() !== "" &&
      (valores.kcal === null || valores.kcal < 0 || valores.kcal > 20000 || !Number.isInteger(valores.kcal))) ||
    (proteina.trim() !== "" && (valores.proteina === null || valores.proteina < 0 || valores.proteina > 1000));

  async function gravar() {
    await salvar("registros_diarios", {
      id: idRegistroDiario(usuario.id, data),
      atualizado_em: agora(),
      excluido: false,
      data,
      peso_kg: valores.peso,
      kcal: valores.kcal,
      proteina_g: valores.proteina,
      observacao: observacao.trim() || null,
    });
    setSalvo(true);
  }

  return (
    <Cartao className="space-y-4">
      <Campo rotulo="Peso em jejum (kg)">
        <input className={estiloEntrada} inputMode="decimal" value={peso} onChange={(e) => { setPeso(e.target.value); setSalvo(false); }} placeholder="ex.: 78,4" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Calorias do dia (kcal)">
          <input className={estiloEntrada} inputMode="numeric" value={kcal} onChange={(e) => { setKcal(e.target.value); setSalvo(false); }} placeholder={usuario.meta_kcal ? `meta ${usuario.meta_kcal}` : ""} />
        </Campo>
        <Campo rotulo="Proteína (g)">
          <input className={estiloEntrada} inputMode="decimal" value={proteina} onChange={(e) => { setProteina(e.target.value); setSalvo(false); }} placeholder={usuario.meta_proteina_g ? `meta ${usuario.meta_proteina_g}` : ""} />
        </Campo>
      </div>
      <Campo rotulo="Observação" dica="Ex.: jogo de basquete, festa, dormiu mal.">
        <input className={estiloEntrada} value={observacao} maxLength={500} onChange={(e) => { setObservacao(e.target.value); setSalvo(false); }} />
      </Campo>
      {invalido && <Aviso tipo="ruim">Confira os números.</Aviso>}
      <Botao variante="principal" className="w-full" disabled={invalido} onClick={gravar}>
        {salvo ? "Salvo ✓" : "Salvar"}
      </Botao>
    </Cartao>
  );
}

export function Dia({ usuario }: { usuario: Usuario }) {
  const [data, setData] = useState(dataLocal());
  const registros = useLiveQuery(() => db.registros_diarios.orderBy("data").reverse().toArray(), []);
  if (!registros) return null;
  const ativos = registros.filter((r) => !r.excluido);
  const doDia = ativos.find((r) => r.data === data);

  return (
    <div className="space-y-4">
      <Titulo>Registro do dia</Titulo>
      <p className="text-sm text-slate-400">
        Conte a comida no FatSecret (ou outro app) e lance aqui só o total do dia. Tudo é opcional.
      </p>
      <Campo rotulo="Dia">
        <input className={estiloEntrada} type="date" value={data} max={dataLocal()} onChange={(e) => e.target.value && setData(e.target.value)} />
      </Campo>
      <Formulario key={data} usuario={usuario} data={data} registro={doDia} />

      {ativos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Últimos dias</h2>
          {ativos.slice(0, 14).map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex w-full items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-left"
              onClick={() => setData(r.data)}
            >
              <span className="text-slate-300">{formatarData(r.data, { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
              <span className="text-sm text-slate-400">
                {[r.peso_kg !== null && formatarKg(r.peso_kg), r.kcal !== null && `${r.kcal} kcal`, r.proteina_g !== null && `${r.proteina_g} g prot.`]
                  .filter(Boolean)
                  .join(" · ") || r.observacao}
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
