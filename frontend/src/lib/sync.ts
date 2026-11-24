// Sincronização em segundo plano: enviar pendentes → baixar desde o cursor → salvar o cursor.
// Roda ao abrir o app (ou voltar a ele depois de um tempo), ao terminar um treino, logo depois de
// salvar algo fora do treino e quando a internet volta. Nunca em intervalo fixo. Sem internet,
// nem tenta: tudo fica no aparelho até a próxima vez.

import { api, ErroApi, gravarToken, lerToken } from "./api";
import { agora, db, gravarMeta, lerMeta, tabela } from "./db";
import { TABELAS, type NomeTabela, type Registros, type Sincronizavel } from "./tipos";

export interface EstadoSync {
  situacao: "ok" | "sincronizando" | "offline" | "erro";
  mensagem?: string;
  quando?: string;
}

type Pacote = { cursor: number } & { [T in NomeTabela]: Registros[T][] };

/** Espera depois de salvar, para juntar mudanças seguidas (ex.: tocar "+" várias vezes na ficha). */
export const ESPERA_MS = 2000;
/** Voltar ao app depois de tanto tempo em segundo plano conta como abrir de novo. */
const AUSENCIA_MS = 5 * 60 * 1000;

let emAndamento: Promise<void> | null = null;
let deNovo = false;
let agendada: ReturnType<typeof setTimeout> | undefined;

/** Sincroniza agora. Chamada no meio de outra, roda de novo no fim, para levar o que mudou. */
export function sincronizar(): Promise<void> {
  if (emAndamento) {
    deNovo = true;
    return emAndamento;
  }
  emAndamento = (async () => {
    do {
      deNovo = false;
      await executar();
    } while (deNovo);
  })().finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

/**
 * Depois de salvar algo fora do treino (registro do dia, perfil, ficha): sincroniza em seguida.
 * As séries não chamam isto: vão todas juntas ao terminar o treino.
 */
export function sincronizarEmBreve(): void {
  clearTimeout(agendada);
  agendada = setTimeout(() => {
    agendada = undefined;
    void sincronizar();
  }, ESPERA_MS);
}

function paraEnvio(registro: Sincronizavel): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pendente, versao, usuario_id, ...resto } = registro as Sincronizavel & {
    usuario_id?: unknown;
  };
  return resto;
}

async function enviar(): Promise<void> {
  const pendentes = {} as { [T in NomeTabela]: Registros[T][] };
  let total = 0;
  for (const nome of TABELAS) {
    const registros = await tabela(nome).where("pendente").equals(1).toArray();
    (pendentes as Record<NomeTabela, Sincronizavel[]>)[nome] = registros;
    total += registros.length;
  }
  if (total === 0) return;

  const corpo = Object.fromEntries(
    TABELAS.map((nome) => [nome, (pendentes[nome] as Sincronizavel[]).map(paraEnvio)]),
  );
  await api("/sync", { metodo: "POST", corpo });

  // Só tira o "pendente" do que não mudou de novo enquanto o envio acontecia.
  await db.transaction("rw", TABELAS.map((n) => db[n]), async () => {
    for (const nome of TABELAS) {
      for (const enviado of pendentes[nome] as Sincronizavel[]) {
        const atual = await tabela(nome).get(enviado.id);
        if (atual && atual.atualizado_em === enviado.atualizado_em) {
          await tabela(nome).update(enviado.id, { pendente: 0 });
        }
      }
    }
  });
}

async function baixar(): Promise<void> {
  const cursor = (await lerMeta<number>("cursor")) ?? 0;
  const pacote = await api<Pacote>(`/sync?desde=${cursor}`);
  await db.transaction("rw", [...TABELAS.map((n) => db[n]), db.meta], async () => {
    for (const nome of TABELAS) {
      for (const remoto of pacote[nome] as Sincronizavel[]) {
        const local = await tabela(nome).get(remoto.id);
        // Mudança local mais nova ainda não enviada: fica a local (vai no próximo envio).
        if (
          local?.pendente === 1 &&
          Date.parse(local.atualizado_em) > Date.parse(remoto.atualizado_em)
        ) {
          continue;
        }
        await tabela(nome).put({ ...remoto, pendente: 0 } as never);
      }
    }
    await gravarMeta("cursor", pacote.cursor);
  });
}

async function executar(): Promise<void> {
  if (!lerToken()) return;
  // `quando` é a última sincronização que deu certo: fica guardado em todos os estados.
  const quando = (await lerMeta<EstadoSync>("estado_sync"))?.quando;
  const registrar = (estado: EstadoSync) => gravarMeta("estado_sync", { quando, ...estado });

  // Sem internet nem tenta. O evento `online` sincroniza quando ela voltar.
  if (navigator.onLine === false) {
    await registrar({ situacao: "offline" });
    return;
  }
  await registrar({ situacao: "sincronizando" });
  try {
    await enviar();
    await baixar();
    await registrar({ situacao: "ok", quando: agora() });
  } catch (erro) {
    const e = erro instanceof ErroApi ? erro : new ErroApi(-1, String(erro));
    if (e.status === 401) {
      // Sessão vencida ou conta apagada: pede login de novo. Os dados locais ficam.
      gravarToken(null);
      await gravarMeta("sessao_expirada", true);
    }
    await registrar(
      e.status === 0 ? { situacao: "offline", mensagem: e.message } : { situacao: "erro", mensagem: e.message },
    );
  }
}

/**
 * Sincronização automática: quando a internet volta, ao voltar para o app depois de um tempo
 * fora e, ao sair dele, já manda o que estava esperando os segundos de `sincronizarEmBreve`.
 */
export function ligarSincronizacaoAutomatica(): () => void {
  let saiuEm: number | null = null;
  const aoVoltarInternet = () => void sincronizar();
  const aoMudarVisibilidade = () => {
    if (document.visibilityState === "hidden") {
      saiuEm = Date.now();
      if (agendada !== undefined) {
        clearTimeout(agendada);
        agendada = undefined;
        void sincronizar();
      }
    } else if (saiuEm !== null && Date.now() - saiuEm >= AUSENCIA_MS) {
      saiuEm = null;
      void sincronizar();
    }
  };
  window.addEventListener("online", aoVoltarInternet);
  document.addEventListener("visibilitychange", aoMudarVisibilidade);
  return () => {
    window.removeEventListener("online", aoVoltarInternet);
    document.removeEventListener("visibilitychange", aoMudarVisibilidade);
  };
}
