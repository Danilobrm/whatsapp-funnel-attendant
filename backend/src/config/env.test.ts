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

describe("env.llm", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to ollama with the Ollama model", async () => {
    const { env: fresh } = await loadEnv({
      LLM_PROVIDER: undefined,
      LLM_MODEL: undefined,
      OLLAMA_MODEL: "qwen2.5",
    });

    expect(fresh.llm.provider).toBe("ollama");
    expect(fresh.llm.model).toBe("qwen2.5");
  });

  it.each([
    ["anthropic", "claude-sonnet-5-5"],
    ["openai", "gpt-4o-mini"],
    ["gemini", "gemini-2.5-flash"],
  ])("%s gets its own default model", async (provider, model) => {
    const { env: fresh } = await loadEnv({
      LLM_PROVIDER: provider,
      LLM_MODEL: undefined,
    });

    expect(fresh.llm.provider).toBe(provider);
    expect(fresh.llm.model).toBe(model);
  });

  it("LLM_MODEL overrides the provider default, and the provider is case-insensitive", async () => {
    const { env: fresh } = await loadEnv({
      LLM_PROVIDER: " Anthropic ",
      LLM_MODEL: "claude-haiku-4-5-20251001",
    });

    expect(fresh.llm.provider).toBe("anthropic");
    expect(fresh.llm.model).toBe("claude-haiku-4-5-20251001");
  });

  it("refuses an unknown provider at boot instead of silently using Ollama", async () => {
    await expect(loadEnv({ LLM_PROVIDER: "mistral" })).rejects.toThrow(
      /LLM_PROVIDER inválido/,
    );
  });

  it("LLM_TIMEOUT_MS wins, then OLLAMA_TIMEOUT_MS, then 30s", async () => {
    expect(
      (
        await loadEnv({
          LLM_PROVIDER: undefined,
          LLM_TIMEOUT_MS: "9000",
          OLLAMA_TIMEOUT_MS: "5000",
        })
      ).env.llm.timeoutMs,
    ).toBe(9000);
    expect(
      (
        await loadEnv({
          LLM_PROVIDER: undefined,
          LLM_TIMEOUT_MS: undefined,
          OLLAMA_TIMEOUT_MS: "5000",
        })
      ).env.llm.timeoutMs,
    ).toBe(5000);
    expect(
      (
        await loadEnv({
          LLM_PROVIDER: undefined,
          LLM_TIMEOUT_MS: undefined,
          OLLAMA_TIMEOUT_MS: undefined,
        })
      ).env.llm.timeoutMs,
    ).toBe(30000);
  });

  it("reads the provider keys", async () => {
    const { env: fresh } = await loadEnv({
      LLM_PROVIDER: undefined,
      ANTHROPIC_API_KEY: "sk-ant",
      OPENAI_API_KEY: "sk-oai",
      GEMINI_API_KEY: "gem-key",
    });

    expect(fresh.llm.anthropicApiKey).toBe("sk-ant");
    expect(fresh.llm.openaiApiKey).toBe("sk-oai");
    expect(fresh.llm.geminiApiKey).toBe("gem-key");
  });
});

describe("env.publicAppUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the Vite dev server outside production", async () => {
    const { env: fresh } = await loadEnv({
      PUBLIC_APP_URL: undefined,
      NODE_ENV: "development",
    });

    expect(fresh.publicAppUrl).toBe("http://localhost:5173");
  });

  // Em produção um default localhost mandaria link quebrado ao cliente.
  it("has NO default in production (the link tool turns itself off)", async () => {
    const { env: fresh } = await loadEnv({
      PUBLIC_APP_URL: undefined,
      NODE_ENV: "production",
    });

    expect(fresh.publicAppUrl).toBe("");
  });

  it("uses the configured URL and strips trailing slashes", async () => {
    const { env: fresh } = await loadEnv({
      PUBLIC_APP_URL: "https://loja.app///",
    });

    expect(fresh.publicAppUrl).toBe("https://loja.app");
  });
});
