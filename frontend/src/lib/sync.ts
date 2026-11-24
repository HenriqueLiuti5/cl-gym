// Sincronização em segundo plano: enviar pendentes → baixar desde o cursor → salvar o cursor.
// Roda ao abrir o app, ao terminar um treino e quando a internet volta (nunca em intervalo fixo).

import { api, ErroApi, gravarToken, lerToken } from "./api";
import { agora, db, gravarMeta, lerMeta, tabela } from "./db";
import { TABELAS, type NomeTabela, type Registros, type Sincronizavel } from "./tipos";

export interface EstadoSync {
  situacao: "ok" | "sincronizando" | "offline" | "erro";
  mensagem?: string;
  quando?: string;
}

type Pacote = { cursor: number } & { [T in NomeTabela]: Registros[T][] };

let emAndamento: Promise<void> | null = null;

export function sincronizar(): Promise<void> {
  if (!emAndamento) {
    emAndamento = executar().finally(() => {
      emAndamento = null;
    });
  }
  return emAndamento;
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
  await gravarMeta("estado_sync", { situacao: "sincronizando" } satisfies EstadoSync);
  try {
    await enviar();
    await baixar();
    await gravarMeta("estado_sync", { situacao: "ok", quando: agora() } satisfies EstadoSync);
  } catch (erro) {
    const e = erro instanceof ErroApi ? erro : new ErroApi(-1, String(erro));
    if (e.status === 401) {
      // Sessão vencida ou conta apagada: pede login de novo. Os dados locais ficam.
      gravarToken(null);
      await gravarMeta("sessao_expirada", true);
    }
    const estado: EstadoSync =
      e.status === 0
        ? { situacao: "offline", mensagem: e.message }
        : { situacao: "erro", mensagem: e.message };
    await gravarMeta("estado_sync", estado);
  }
}

/** Liga a sincronização automática quando a internet volta. */
export function sincronizarQuandoVoltarInternet(): () => void {
  const aoVoltar = () => void sincronizar();
  window.addEventListener("online", aoVoltar);
  return () => window.removeEventListener("online", aoVoltar);
}
