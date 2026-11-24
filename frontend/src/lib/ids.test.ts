import { describe, expect, it } from "vitest";

import { idRegistroDiario, novoId, uuid5 } from "./ids";

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
    expect(idRegistroDiario("u1", "2026-11-24")).toBe(a);
    expect(idRegistroDiario("u2", "2026-11-24")).not.toBe(a);
    expect(idRegistroDiario("u1", "2026-11-25")).not.toBe(a);
  });
});
