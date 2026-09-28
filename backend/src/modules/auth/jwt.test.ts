import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { env } from "../../config/env.js";

import { signAuthToken, verifyAuthToken } from "./jwt.js";

function encode(part: object): string {
  return Buffer.from(JSON.stringify(part)).toString("base64url");
}

describe("signAuthToken / verifyAuthToken", () => {
  it("faz roundtrip preservando userId e tenantId", () => {
    const token = signAuthToken({ userId: 7, tenantId: 3 });
    const result = verifyAuthToken(token);

    expect(result).toEqual({ ok: true, payload: { userId: 7, tenantId: 3 } });
  });

  it("assina com HS256 e inclui exp", () => {
    const decoded = jwt.decode(signAuthToken({ userId: 1, tenantId: 1 }), {
      complete: true,
    });

    expect(decoded?.header.alg).toBe("HS256");
    expect(typeof decoded?.payload).toBe("object");
    expect((decoded?.payload as { exp?: number }).exp).toBeGreaterThan(0);
  });

  it("rejeita assinatura adulterada", () => {
    const [header, payload] = signAuthToken({
      userId: 1,
      tenantId: 1,
    }).split(".");

    expect(verifyAuthToken(`${header}.${payload}.assinaturaerrada`)).toEqual({
      ok: false,
      code: "invalid_token",
    });
  });

  it("rejeita payload adulterado (escalada de tenant)", () => {
    const token = signAuthToken({ userId: 1, tenantId: 1 });
    const [header, , signature] = token.split(".");
    const forged = `${header}.${encode({ userId: 1, tenantId: 999 })}.${signature}`;

    expect(verifyAuthToken(forged)).toEqual({
      ok: false,
      code: "invalid_token",
    });
  });

  it("rejeita token assinado com outro segredo", () => {
    const foreign = jwt.sign(
      { userId: 1, tenantId: 1 },
      "outro-segredo-qualquer",
      {
        algorithm: "HS256",
        expiresIn: 60,
      },
    );

    expect(verifyAuthToken(foreign)).toEqual({
      ok: false,
      code: "invalid_token",
    });
  });

  it("distingue token expirado de token inválido", () => {
    const expired = jwt.sign({ userId: 1, tenantId: 1 }, env.jwtSecret, {
      algorithm: "HS256",
      expiresIn: -60,
    });

    expect(verifyAuthToken(expired)).toEqual({
      ok: false,
      code: "expired_token",
    });
  });

  it('rejeita alg "none"', () => {
    const unsigned = `${encode({ alg: "none", typ: "JWT" })}.${encode({
      userId: 1,
      tenantId: 999,
      exp: Math.floor(Date.now() / 1000) + 600,
    })}.`;

    expect(verifyAuthToken(unsigned)).toEqual({
      ok: false,
      code: "invalid_token",
    });
  });

  it("rejeita token sem exp — token eterno não é token válido", () => {
    const eternal = jwt.sign({ userId: 1, tenantId: 1 }, env.jwtSecret, {
      algorithm: "HS256",
    });

    expect(verifyAuthToken(eternal)).toEqual({
      ok: false,
      code: "invalid_token",
    });
  });

  it.each([
    ["userId ausente", { tenantId: 1 }],
    ["tenantId ausente", { userId: 1 }],
    ["tenantId zero", { userId: 1, tenantId: 0 }],
    ["tenantId negativo", { userId: 1, tenantId: -3 }],
    ["tenantId fracionário", { userId: 1, tenantId: 1.5 }],
    ["tenantId como string", { userId: 1, tenantId: "1" }],
  ])("rejeita payload com %s", (_label, payload) => {
    const token = jwt.sign(payload, env.jwtSecret, {
      algorithm: "HS256",
      expiresIn: 60,
    });

    expect(verifyAuthToken(token)).toEqual({
      ok: false,
      code: "invalid_token",
    });
  });

  it.each([
    ["string vazia", ""],
    ["texto solto", "nao-e-um-jwt"],
    ["dois segmentos", "aaa.bbb"],
    ["base64 inválido", "###.###.###"],
  ])("rejeita %s sem lançar", (_label, token) => {
    expect(() => verifyAuthToken(token)).not.toThrow();
    expect(verifyAuthToken(token).ok).toBe(false);
  });
});
