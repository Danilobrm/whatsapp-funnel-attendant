import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "./env.js";

/**
 * `env` é avaliado no import, então cada cenário precisa de um módulo novo:
 * stub das variáveis → resetModules → reimporta.
 */
async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      vi.stubEnv(key, "");
      delete process.env[key];
    } else {
      vi.stubEnv(key, value);
    }
  }
  return import("./env.js");
}

describe("env", () => {
  it("exposes a numeric port", () => {
    expect(typeof env.port).toBe("number");
    expect(Number.isFinite(env.port)).toBe(true);
  });

  it("builds a databaseUrl string", () => {
    expect(typeof env.databaseUrl).toBe("string");
    expect(env.databaseUrl).toMatch(/^postgres(ql)?:\/\//);
  });

  it("has ollama defaults", () => {
    expect(env.ollamaBaseUrl).toMatch(/^https?:\/\//);
    expect(env.ollamaModel.length).toBeGreaterThan(0);
  });

  it("has finite ollama timeout", () => {
    expect(Number.isFinite(env.ollamaTimeoutMs)).toBe(true);
    expect(env.ollamaTimeoutMs).toBeGreaterThan(0);
  });

  // O modelo de chat roda no hot path da conversa: o cliente está esperando
  // no WhatsApp, então o timeout não pode ser da ordem de minutos.
  it("bounds the chat timeout to under a minute", () => {
    expect(env.ollamaTimeoutMs).toBeLessThanOrEqual(60_000);
  });

  it("has whatsapp defaults that keep sending off in dev", () => {
    expect(env.whatsapp.graphApiVersion).toMatch(/^v\d+\.\d+$/);
    expect(env.whatsapp.timeoutMs).toBeGreaterThan(0);
  });

  it("has a usable jwt secret and expiry in development", () => {
    expect(env.jwtSecret.length).toBeGreaterThan(0);
    expect(Number.isFinite(env.jwtExpiresInSeconds)).toBe(true);
    expect(env.jwtExpiresInSeconds).toBeGreaterThan(0);
  });
});

describe("assertProductionSecrets", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does nothing outside production", async () => {
    const mod = await loadEnv({
      NODE_ENV: "development",
      JWT_SECRET: undefined,
    });

    expect(() => mod.assertProductionSecrets()).not.toThrow();
  });

  it("throws in production when JWT_SECRET is missing", async () => {
    const mod = await loadEnv({
      NODE_ENV: "production",
      JWT_SECRET: undefined,
    });

    expect(() => mod.assertProductionSecrets()).toThrow(/JWT_SECRET/);
  });

  it("throws in production when JWT_SECRET is the dev default", async () => {
    const { DEV_JWT_SECRET } = await import("./env.js");
    const mod = await loadEnv({
      NODE_ENV: "production",
      JWT_SECRET: DEV_JWT_SECRET,
    });

    expect(() => mod.assertProductionSecrets()).toThrow(/JWT_SECRET/);
  });

  it("throws in production when JWT_SECRET is too short", async () => {
    const mod = await loadEnv({ NODE_ENV: "production", JWT_SECRET: "curto" });

    expect(() => mod.assertProductionSecrets()).toThrow(/caracteres/);
  });

  it("passes in production with a long custom secret", async () => {
    const mod = await loadEnv({
      NODE_ENV: "production",
      JWT_SECRET: "x".repeat(48),
    });

    expect(() => mod.assertProductionSecrets()).not.toThrow();
  });
});
