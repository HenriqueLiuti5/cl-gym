import { describe, expect, it } from "vitest";

import { idMeta, idRegistroDiario, novoId, uuid5 } from "./ids";

describe("ids", () => {
  it("gera UUID v4", () => {
    expect(novoId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(novoId()).not.toBe(novoId());
  });

  it("uuid5 bate com o do Python", () => {
    // python3 -c "import uuid; print(uuid.uuid5(uuid.NAMESPACE_DNS, 'python.org'))"
    expect(uuid5("python.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "886313e1-3b8a-5372-9b90-0c9aee199e5d",
    );
  });

  it("registro do dia tem id fixo por usuário e data", () => {
    const a = idRegistroDiario("u1", "2026-11-24");
    // O mesmo do backend/dados_dev.py (o gerador de dados de dev grava com este id).
    expect(a).toBe("bff7dca1-fadb-5b35-8ab5-cd794d39e2de");
    expect(idRegistroDiario("u2", "2026-11-24")).not.toBe(a);
    expect(idRegistroDiario("u1", "2026-11-25")).not.toBe(a);
  });

  it("meta tem id fixo por usuário, tipo e exercício", () => {
    const usuario = "0d7d4f9c-472a-4926-aa6a-4ad9e3cfe362";
    // Os mesmos de backend/tests/test_dados_dev.py.
    expect(idMeta(usuario, "peso")).toBe("63e95567-4fcc-5bf3-b613-806376b5fca2");
    expect(idMeta(usuario, "carga", "6f1d0c8e-0000-4000-8000-000000000001")).toBe(
      "129cada6-ec8e-5515-9e39-753529b74894",
    );
    expect(idMeta(usuario, "carga", "outro")).not.toBe(idMeta(usuario, "carga", "6f1d0c8e-0000-4000-8000-000000000001"));
  });
});
