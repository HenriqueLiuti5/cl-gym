// Curiosidades da aba de mesmo nome: números do histórico com comparações do dia a dia.
// As comparações são aproximadas (e ditas como tal no texto).

import {
  constanciaDoRegistro,
  DIAS_DA_SEMANA,
  diasEntre,
  exerciciosFeitos,
  extremosDeHorario,
  maiorEvolucao,
  maiorPausa,
  maiorSequenciaDeDias,
  periodoFavorito,
  pontosDePeso,
  recordes,
  resumoTreinos,
  seriesPorGrupo,
  totaisDoDia,
  vezesPlanoB,
  type Treino,
} from "./estatisticas";
import { formatarData, formatarDuracao, formatarNumero, formatarTonelada, formatarVariacao } from "./formato";
import { somarDias } from "./regras";
import type { Exercicio, FichaExercicio, RegistroDiario } from "./tipos";

/** Assuntos da aba, na ordem em que aparecem. */
export const GRUPOS_CURIOSIDADE = ["Treinos", "Rotina", "Exercícios", "Corpo e alimentação"] as const;

export interface Curiosidade {
  grupo: (typeof GRUPOS_CURIOSIDADE)[number];
  titulo: string;
  valor: string;
  detalhe: string;
}

export const plural = (n: number, um: string, varios: string) => `${formatarNumero(n, 0)} ${Math.round(n) === 1 ? um : varios}`;
const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "o mesmo que 30 elefantes-africanos": o objeto mais pesado que cabe pelo menos 2 vezes. */
export function comparacaoDePeso(kg: number): string | null {
  const objetos = [
    { kg: 150_000, um: "uma baleia-azul", varios: "baleias-azuis" },
    { kg: 6_000, um: "um elefante-africano", varios: "elefantes-africanos" },
    { kg: 1_000, um: "um carro popular", varios: "carros populares" },
    { kg: 70, um: "uma geladeira", varios: "geladeiras" },
  ];
  const escolhido = objetos.find((o) => kg / o.kg >= 2) ?? objetos.find((o) => kg / o.kg >= 1);
  if (!escolhido) return null;
  const vezes = Math.round(kg / escolhido.kg);
  return vezes === 1 ? escolhido.um : `${formatarNumero(vezes, 0)} ${escolhido.varios}`;
}

/** Subida equivalente às repetições, se cada uma fosse um degrau de 18 cm. */
export function comparacaoDeAltura(reps: number): string {
  const metros = reps * 0.18;
  const lugares = [
    { m: 8_849, nome: "o Everest" },
    { m: 396, nome: "o Pão de Açúcar" },
    { m: 38, nome: "o Cristo Redentor" },
  ];
  const distancia = metros >= 1000 ? `${formatarNumero(metros / 1000)} km` : `${formatarNumero(metros, 0)} m`;
  const lugar = lugares.find((l) => metros / l.m >= 1);
  if (!lugar) return `você teria subido ${distancia}`;
  const vezes = metros / lugar.m;
  const quanto = vezes < 1.5 ? "mais que" : `${formatarNumero(vezes, vezes < 10 ? 1 : 0)} vezes`;
  return `você teria subido ${distancia}: ${quanto} ${lugar.nome}`;
}

export function curiosidades(entrada: {
  treinos: Treino[];
  exercicios: Exercicio[];
  itens: FichaExercicio[];
  registros: RegistroDiario[];
  hoje: string;
}): Curiosidade[] {
  const { treinos, exercicios, itens, registros, hoje } = entrada;
  const lista: Curiosidade[] = [];
  const resumo = resumoTreinos(treinos);

  if (resumo.total > 0) {
    const comparacao = comparacaoDePeso(resumo.volume);
    lista.push({
      grupo: "Treinos",
      titulo: "Peso levantado",
      valor: formatarTonelada(resumo.volume),
      detalhe: `Somando carga × repetições de todas as séries${comparacao ? `: mais ou menos ${comparacao}` : ""}.`,
    });
    lista.push({
      grupo: "Treinos",
      titulo: "Repetições",
      valor: formatarNumero(resumo.reps, 0),
      detalhe: `Se cada uma fosse um degrau, ${comparacaoDeAltura(resumo.reps)}.`,
    });
  }
  if (resumo.minutos > 0) {
    lista.push({
      grupo: "Treinos",
      titulo: "Tempo treinando",
      valor: formatarDuracao(resumo.minutos),
      detalhe: `Dá para ver ${plural(resumo.minutos / 90, "jogo de futebol inteiro", "jogos de futebol inteiros")}. Em média, ${formatarDuracao(resumo.mediaMinutos!)} por treino.`,
    });
  }
  if (resumo.maisLongo) {
    lista.push({
      grupo: "Treinos",
      titulo: "Treino mais longo",
      valor: formatarDuracao(resumo.maisLongo.minutos!),
      detalhe: `Em ${formatarData(resumo.maisLongo.data, { day: "2-digit", month: "2-digit", year: "2-digit" })}.`,
    });
  }

  const contagemDias = Array<number>(7).fill(0);
  for (const t of treinos) contagemDias[(t.inicio.getDay() + 6) % 7]! += 1;
  const maxDia = Math.max(...contagemDias);
  if (maxDia > 0) {
    const dia = DIAS_DA_SEMANA[contagemDias.indexOf(maxDia)]!;
    const fim = dia === "sábado" || dia === "domingo" ? "aos" : "às";
    lista.push({
      grupo: "Rotina",
      titulo: "Dia preferido",
      valor: dia[0]!.toUpperCase() + dia.slice(1),
      detalhe: `${plural(maxDia, "treino", "treinos")} ${fim} ${dia}s.`,
    });
  }
  const turno = periodoFavorito(treinos);
  if (turno) {
    const desde = { madrugada: "antes das 5h", manhã: "entre 5h e meio-dia", tarde: "entre meio-dia e 18h", noite: "depois das 18h" }[turno.periodo];
    lista.push({
      grupo: "Rotina",
      titulo: "Time da " + turno.periodo,
      valor: `${formatarNumero(turno.fracao * 100, 0)}%`,
      detalhe: `dos treinos começaram ${desde}.`,
    });
  }
  const extremos = extremosDeHorario(treinos);
  if (extremos && treinos.length > 1) {
    lista.push({
      grupo: "Rotina",
      titulo: "Mais cedo e mais tarde",
      valor: `${hora(extremos.cedo.inicio)} · ${hora(extremos.tarde.inicio)}`,
      detalhe: `O treino mais cedo foi em ${formatarData(extremos.cedo.data)} e o mais tarde em ${formatarData(extremos.tarde.data)}.`,
    });
  }

  const resumos = exerciciosFeitos(treinos, exercicios);
  const favorito = resumos[0];
  if (favorito) {
    lista.push({
      grupo: "Exercícios",
      titulo: "Exercício favorito",
      valor: favorito.exercicio.nome,
      detalhe: `Feito em ${plural(favorito.treinos, "treino", "treinos")}, ${plural(favorito.series, "série", "séries")} no total.`,
    });
  }
  const evolucao = maiorEvolucao(resumos);
  if (evolucao) {
    lista.push({
      grupo: "Exercícios",
      titulo: "Maior evolução",
      valor: formatarVariacao(evolucao.ganho, "kg"),
      detalhe: `${evolucao.exercicio.nome}: de ${formatarNumero(evolucao.de)} para ${formatarNumero(evolucao.para)} kg (+${formatarNumero(evolucao.fracao * 100, 0)}%).`,
    });
  }
  const prs = recordes(resumos);
  if (prs.length) {
    const ultimoMes = prs.filter((r) => r.data >= somarDias(hoje, -30)).length;
    const ultimo = prs[0]!;
    lista.push({
      grupo: "Exercícios",
      titulo: "Recordes batidos",
      valor: formatarNumero(prs.length, 0),
      detalhe: `${formatarNumero(ultimoMes, 0)} nos últimos 30 dias. O último: ${ultimo.exercicio.nome}, ${formatarNumero(ultimo.carga)} kg em ${formatarData(ultimo.data)}.`,
    });
  }
  const maisForte = resumos.reduce<(typeof resumos)[number] | null>((m, r) => (!m || r.e1rm.valor > m.e1rm.valor ? r : m), null);
  if (maisForte && maisForte.e1rm.reps > 1) {
    lista.push({
      grupo: "Exercícios",
      titulo: "Força máxima estimada",
      valor: `≈ ${formatarNumero(Math.round(maisForte.e1rm.valor), 0)} kg`,
      detalhe: `${maisForte.exercicio.nome}: quanto daria para levantar uma vez só, estimado pelas ${formatarNumero(maisForte.e1rm.carga)} kg × ${maisForte.e1rm.reps} de ${formatarData(maisForte.e1rm.data)}.`,
    });
  }
  const trocas = vezesPlanoB(treinos, itens);
  if (trocas > 0) {
    lista.push({
      grupo: "Exercícios",
      titulo: "Plano B",
      valor: plural(trocas, "vez", "vezes"),
      detalhe: "em que o aparelho estava ocupado e você trocou de exercício.",
    });
  }
  const grupos = seriesPorGrupo(treinos, exercicios);
  if (grupos.length) {
    lista.push({
      grupo: "Exercícios",
      titulo: "Músculo mais treinado",
      valor: grupos[0]!.grupo,
      detalhe: `${plural(grupos[0]!.series, "série", "séries")} no total.${grupos.length > 1 ? ` O menos treinado: ${grupos[grupos.length - 1]!.grupo}.` : ""}`,
    });
  }
  const seguidos = maiorSequenciaDeDias(treinos.map((t) => t.data));
  if (seguidos > 1) {
    lista.push({ grupo: "Rotina", titulo: "Dias seguidos", valor: plural(seguidos, "dia", "dias"), detalhe: "é a sua maior sequência treinando sem parar." });
  }
  const pausa = maiorPausa(treinos);
  if (pausa && pausa.dias >= 3) {
    lista.push({
      grupo: "Rotina",
      titulo: "Maior pausa",
      valor: plural(pausa.dias, "dia", "dias"),
      detalhe: `sem treinar, entre ${formatarData(pausa.de)} e ${formatarData(pausa.ate)}.`,
    });
  }
  if (resumo.primeiro && resumo.total > 1) {
    const dias = diasEntre(resumo.primeiro.data, hoje);
    lista.push({
      grupo: "Rotina",
      titulo: "Desde o primeiro treino",
      valor: plural(dias, "dia", "dias"),
      detalhe: `${plural(resumo.total, "treino", "treinos")}: um a cada ${formatarNumero(Math.max(1, dias) / resumo.total)} dias.`,
    });
  }

  const pesos = pontosDePeso(registros);
  if (pesos.length > 1) {
    const variacao = pesos[pesos.length - 1]!.media7 - pesos[0]!.peso;
    const arroz = Math.abs(variacao) / 5;
    lista.push({
      grupo: "Corpo e alimentação",
      titulo: variacao <= 0 ? "Peso que foi embora" : "Peso que chegou",
      valor: formatarVariacao(variacao, "kg"),
      detalhe: `Desde ${formatarData(pesos[0]!.data)}, pela média de 7 dias${arroz >= 0.9 ? `: o peso de ${plural(arroz, "pacote", "pacotes")} de arroz de 5 kg` : ""}.`,
    });
  }
  const totais = totaisDoDia(registros);
  if (totais.proteina > 0) {
    lista.push({
      grupo: "Corpo e alimentação",
      titulo: "Proteína lançada",
      valor: formatarTonelada(totais.proteina / 1000),
      detalhe: `A mesma proteína de uns ${formatarNumero(Math.round(totais.proteina / 6 / 10) * 10, 0)} ovos.`,
    });
  }
  if (totais.carbo > 0) {
    lista.push({
      grupo: "Corpo e alimentação",
      titulo: "Carboidrato lançado",
      valor: formatarTonelada(totais.carbo / 1000),
      detalhe: `O mesmo de uns ${formatarNumero(Math.round(totais.carbo / 28 / 10) * 10, 0)} pães franceses.`,
    });
  }
  if (totais.kcal > 0) {
    lista.push({
      grupo: "Corpo e alimentação",
      titulo: "Calorias lançadas",
      valor: totais.kcal >= 10_000 ? `${formatarNumero(totais.kcal / 1000, 0)} mil kcal` : `${formatarNumero(totais.kcal, 0)} kcal`,
      detalhe: `Mais ou menos ${plural(totais.kcal / 2000, "pizza grande", "pizzas grandes")} (2.000 kcal cada).`,
    });
  }
  if (totais.agua > 0) {
    const litros = totais.agua / 1000;
    const banheiras = litros / 150;
    lista.push({
      grupo: "Corpo e alimentação",
      titulo: "Água bebida",
      valor: `${formatarNumero(litros, 0)} L`,
      detalhe: `São ${plural(totais.agua / 250, "copo", "copos")} de 250 ml${banheiras >= 1 ? `, ou ${plural(banheiras, "banheira cheia", "banheiras cheias")}` : ""}.`,
    });
  }
  const constancia = constanciaDoRegistro(registros, hoje);
  if (constancia && constancia.dias >= 7) {
    lista.push({
      grupo: "Corpo e alimentação",
      titulo: "Registro do dia",
      valor: `${formatarNumero((constancia.lancados / constancia.dias) * 100, 0)}%`,
      detalhe: `dos dias com algo lançado (${constancia.lancados} de ${constancia.dias}).`,
    });
  }
  return lista;
}
