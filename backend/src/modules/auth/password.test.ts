import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.js";

describe("password", () => {
  it("nunca guarda o texto claro", async () => {
    const hash = await hashPassword("123456");

    expect(hash).not.toContain("123456");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("aceita a senha correta e recusa a errada", async () => {
    const hash = await hashPassword("123456");

    expect(await verifyPassword("123456", hash)).toBe(true);
    expect(await verifyPassword("1234567", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("gera hashes diferentes para a mesma senha (salt)", async () => {
    const [a, b] = await Promise.all([
      hashPassword("123456"),
      hashPassword("123456"),
    ]);

    expect(a).not.toBe(b);
    expect(await verifyPassword("123456", a)).toBe(true);
    expect(await verifyPassword("123456", b)).toBe(true);
  });

  it("devolve false em hash corrompido em vez de lançar", async () => {
    await expect(verifyPassword("123456", "isto-nao-e-um-hash")).resolves.toBe(
      false,
    );
  });
});
