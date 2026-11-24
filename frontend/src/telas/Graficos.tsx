import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Campo, Cartao, estiloEntrada, Titulo } from "../componentes/ui";
import { formatarData } from "../lib/formato";
import { db } from "../lib/db";
import { evolucao, mediasSemanais, pesoComMedia7 } from "../lib/regras";
import type { Usuario } from "../lib/tipos";

const eixo = { stroke: "#64748b", fontSize: 12 };
const dica = { contentStyle: { background: "#0f172a", border: "1px solid #334155", borderRadius: 12 } };

function Vazio({ children }: { children: string }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

export function Graficos({ usuario }: { usuario: Usuario }) {
  const exercicios = useLiveQuery(() => db.exercicios.toArray(), []);
  const series = useLiveQuery(() => db.series.toArray(), []);
  const sessoes = useLiveQuery(() => db.sessoes.toArray(), []);
  const registros = useLiveQuery(() => db.registros_diarios.toArray(), []);
  const [escolhido, setEscolhido] = useState<string>("");
  if (!exercicios || !series || !sessoes || !registros) return null;

  const feitos = new Set(series.filter((s) => !s.excluido).map((s) => s.exercicio_id));
  const opcoes = exercicios.filter((e) => feitos.has(e.id)).sort((a, b) => a.nome.localeCompare(b.nome));
  const exercicioId = escolhido || opcoes[0]?.id || "";
  const pontosCarga = evolucao(exercicioId, series, sessoes).map((p) => ({ ...p, rotulo: formatarData(p.data) }));
  const pontosPeso = pesoComMedia7(registros).map((p) => ({ ...p, rotulo: formatarData(p.data) }));
  const semanas = mediasSemanais(registros).map((s) => ({ ...s, rotulo: formatarData(s.semana) }));

  return (
    <div className="space-y-4">
      <Titulo>Evolução</Titulo>

      <Cartao className="space-y-3">
        <h2 className="font-semibold">Carga por exercício</h2>
        {opcoes.length === 0 ? (
          <Vazio>Registre um treino para ver a evolução.</Vazio>
        ) : (
          <>
            <Campo rotulo="Exercício">
              <select className={estiloEntrada} value={exercicioId} onChange={(e) => setEscolhido(e.target.value)}>
                {opcoes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={pontosCarga} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid stroke="#1e293b" />
                  <XAxis dataKey="rotulo" {...eixo} />
                  <YAxis {...eixo} domain={["auto", "auto"]} unit=" kg" width={64} />
                  <Tooltip {...dica} formatter={(v) => [`${v} kg`, "Maior carga"]} />
                  <Line type="monotone" dataKey="valor" stroke="#34d399" strokeWidth={3} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-500">A maior carga de cada treino.</p>
          </>
        )}
      </Cartao>

      <Cartao className="space-y-3">
        <h2 className="font-semibold">Peso (média de 7 dias)</h2>
        {pontosPeso.length === 0 ? (
          <Vazio>Lance o peso em jejum no registro do dia.</Vazio>
        ) : (
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={pontosPeso} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="rotulo" {...eixo} />
                <YAxis {...eixo} domain={["auto", "auto"]} unit=" kg" width={64} />
                <Tooltip {...dica} />
                {usuario.meta_peso_kg && <ReferenceLine y={usuario.meta_peso_kg} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "meta", fill: "#f59e0b", fontSize: 12 }} />}
                <Line type="monotone" dataKey="peso" name="Peso do dia" stroke="#475569" dot={{ r: 2 }} strokeWidth={1} />
                <Line type="monotone" dataKey="media7" name="Média 7 dias" stroke="#34d399" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Cartao>

      {(["kcal", "proteina"] as const).map((campo) => {
        const meta = campo === "kcal" ? usuario.meta_kcal : usuario.meta_proteina_g;
        const dados = semanas.filter((s) => s[campo] !== null);
        return (
          <Cartao key={campo} className="space-y-3">
            <h2 className="font-semibold">{campo === "kcal" ? "Calorias" : "Proteína"}: média por semana</h2>
            {dados.length === 0 ? (
              <Vazio>{campo === "kcal" ? "Lance as calorias do dia." : "Lance a proteína do dia."}</Vazio>
            ) : (
              <div className="h-48">
                <ResponsiveContainer>
                  <BarChart data={dados} margin={{ left: -20, right: 8, top: 8 }}>
                    <CartesianGrid stroke="#1e293b" />
                    <XAxis dataKey="rotulo" {...eixo} />
                    <YAxis {...eixo} width={64} unit={campo === "kcal" ? "" : " g"} />
                    <Tooltip {...dica} formatter={(v) => [campo === "kcal" ? `${v} kcal` : `${v} g`, "Média"]} labelFormatter={(r) => `Semana de ${r}`} />
                    {meta && <ReferenceLine y={meta} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "meta", fill: "#f59e0b", fontSize: 12 }} />}
                    <Bar dataKey={campo} fill={campo === "kcal" ? "#38bdf8" : "#a78bfa"} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {!meta && <p className="text-xs text-slate-500">Defina a meta na tela Conta para comparar.</p>}
          </Cartao>
        );
      })}
    </div>
  );
}
