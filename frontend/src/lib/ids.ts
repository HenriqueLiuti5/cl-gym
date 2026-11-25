// IDs gerados no aparelho. Funciona também em http:// (ex.: testar pelo IP da rede), onde
// crypto.randomUUID e crypto.subtle não existem.

import type { TipoMeta } from "./tipos";

function hex(bytes: Uint8Array): string {
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function novoId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return hex(bytes);
}

function sha1(dados: Uint8Array): Uint8Array {
  const tamanho = dados.length;
  const total = Math.ceil((tamanho + 9) / 64) * 64;
  const m = new Uint8Array(total);
  m.set(dados);
  m[tamanho] = 0x80;
  const vista = new DataView(m.buffer);
  vista.setUint32(total - 4, tamanho * 8);
  vista.setUint32(total - 8, Math.floor((tamanho * 8) / 2 ** 32));
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  for (let bloco = 0; bloco < total; bloco += 64) {
    for (let i = 0; i < 16; i++) w[i] = vista.getUint32(bloco + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = (x << 1) | (x >>> 31);
    }
    let [a, b, c, d, e] = h as [number, number, number, number, number];
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : i < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : i < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6];
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
  }
  const saida = new Uint8Array(20);
  const vs = new DataView(saida.buffer);
  h.forEach((valor, i) => vs.setUint32(i * 4, valor));
  return saida;
}

/** UUID v5 (RFC 9562): o mesmo nome no mesmo namespace dá sempre o mesmo id. */
export function uuid5(nome: string, namespace: string): string {
  const ns = Uint8Array.from(namespace.replace(/-/g, "").match(/../g)!, (b) => parseInt(b, 16));
  const texto = new TextEncoder().encode(nome);
  const entrada = new Uint8Array(ns.length + texto.length);
  entrada.set(ns);
  entrada.set(texto, ns.length);
  const bytes = sha1(entrada).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return hex(bytes);
}

// Fixo: muda isto e os registros do dia já criados deixam de bater entre os aparelhos.
const NAMESPACE_REGISTRO_DIARIO = "3c5b8f0e-2a4d-4f6b-9e1a-7d2c6b9a0f13";

/** Só pode haver um registro por dia: o id sai do usuário + data, igual em todo aparelho. */
export function idRegistroDiario(usuarioId: string, data: string): string {
  return uuid5(`${usuarioId}:${data}`, NAMESPACE_REGISTRO_DIARIO);
}

// Fixo, igual ao de backend/dados_dev.py: muda isto e as metas deixam de bater entre os aparelhos.
const NAMESPACE_METAS = "d398a7b8-d44e-49d6-8104-b0586e9eac28";

/** Só há uma meta por tipo (e por exercício, nas de carga): o id sai do usuário, tipo e exercício. */
export function idMeta(usuarioId: string, tipo: TipoMeta, exercicioId: string | null = null): string {
  return uuid5(`${usuarioId}:${tipo}:${exercicioId ?? ""}`, NAMESPACE_METAS);
}
