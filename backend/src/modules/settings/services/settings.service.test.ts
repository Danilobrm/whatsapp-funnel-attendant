import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvalidSettingsError } from "../errors/settings.errors.js";
import { asTenantId } from "../../tenants/types/tenant.types.js";
import { SettingsService } from "./settings.service.js";
import { buildPersonaTexts, DEFAULT_BOT_SETTINGS } from "../utils/persona.js";

import type { SettingsRepository } from "../repositories/settings.repository.js";

const findMock = vi.fn();
const saveMock = vi.fn();
const service = new SettingsService({
  findBotSettings: findMock,
  saveBotSettings: saveMock,
} as unknown as SettingsRepository);
const getBotSettings = service.getBotSettings.bind(service);
const updateBotSettings = service.updateBotSettings.bind(service);
const resolvePersonaTexts = service.resolvePersonaTexts.bind(service);
const invalidateBotSettingsCache =
  service.invalidateBotSettingsCache.bind(service);

const TENANT = asTenantId(1);

const valid = {
  name: "Nina",
  personality: "friendly" as const,
  gender: "female" as const,
  languages: ["pt-BR"],
};

beforeEach(() => {
  vi.clearAllMocks();
  invalidateBotSettingsCache();
});

describe("getBotSettings", () => {
  it("returns the stored row", async () => {
    findMock.mockResolvedValue({ ...valid, updatedAt: "2026-01-01T00:00:00Z" });
    await expect(getBotSettings(TENANT)).resolves.toMatchObject(valid);
  });

  it("falls back to defaults when the row does not exist yet", async () => {
    findMock.mockResolvedValue(null);
    await expect(getBotSettings(TENANT)).resolves.toEqual(DEFAULT_BOT_SETTINGS);
  });

  it("reads the row once and serves the cache — persona is in the hot path", async () => {
    findMock.mockResolvedValue({ ...valid, updatedAt: null });

    await getBotSettings(TENANT);
    await getBotSettings(TENANT);
    await getBotSettings(TENANT);

    expect(findMock).toHaveBeenCalledTimes(1);
  });

  it("re-reads after the cache is invalidated", async () => {
    findMock.mockResolvedValue({ ...valid, updatedAt: null });

    await getBotSettings(TENANT);
    invalidateBotSettingsCache();
    await getBotSettings(TENANT);

    expect(findMock).toHaveBeenCalledTimes(2);
  });
});

describe("cache por tenant", () => {
  const OUTRO = asTenantId(2);

  it("cacheia cada tenant separadamente — uma leitura por tenant", async () => {
    findMock.mockImplementation(async (tenantId: unknown) => ({
      ...valid,
      name: tenantId === TENANT ? "Nina" : "Théo",
      updatedAt: null,
    }));

    await getBotSettings(TENANT);
    await getBotSettings(OUTRO);
    await getBotSettings(TENANT);
    await getBotSettings(OUTRO);

    expect(findMock).toHaveBeenCalledTimes(2);
  });

  it("nunca serve a persona de um tenant para o outro", async () => {
    findMock.mockImplementation(async (tenantId: unknown) => ({
      ...valid,
      name: tenantId === TENANT ? "Nina" : "Théo",
      updatedAt: null,
    }));

    await expect(getBotSettings(TENANT)).resolves.toMatchObject({
      name: "Nina",
    });
    await expect(getBotSettings(OUTRO)).resolves.toMatchObject({
      name: "Théo",
    });
  });

  it("invalidar um tenant deixa o outro em cache", async () => {
    findMock.mockResolvedValue({ ...valid, updatedAt: null });
    await getBotSettings(TENANT);
    await getBotSettings(OUTRO);
    expect(findMock).toHaveBeenCalledTimes(2);

    invalidateBotSettingsCache(TENANT);
    await getBotSettings(TENANT);
    await getBotSettings(OUTRO);

    expect(findMock).toHaveBeenCalledTimes(3);
  });

  it("salvar num tenant não invalida o cache do outro", async () => {
    findMock.mockResolvedValue({ ...valid, name: "Nina", updatedAt: null });
    await getBotSettings(TENANT);
    await getBotSettings(OUTRO);

    saveMock.mockResolvedValue({
      ...valid,
      name: "Renomeado",
      updatedAt: null,
    });
    await updateBotSettings(TENANT, { ...valid, name: "Renomeado" });

    await expect(getBotSettings(TENANT)).resolves.toMatchObject({
      name: "Renomeado",
    });
    await expect(getBotSettings(OUTRO)).resolves.toMatchObject({
      name: "Nina",
    });
    expect(findMock).toHaveBeenCalledTimes(2);
  });
});

describe("updateBotSettings", () => {
  it("persists the parsed payload", async () => {
    saveMock.mockResolvedValue({ ...valid, updatedAt: "2026-01-01T00:00:00Z" });

    const result = await updateBotSettings(TENANT, {
      ...valid,
      name: " Nina ",
    });

    expect(saveMock).toHaveBeenCalledWith(TENANT, valid);
    expect(result.updatedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("serves the saved row immediately — no stale persona after a save", async () => {
    findMock.mockResolvedValue({ ...valid, name: "Antigo", updatedAt: null });
    await getBotSettings(TENANT);

    saveMock.mockResolvedValue({ ...valid, name: "Novo", updatedAt: null });
    await updateBotSettings(TENANT, { ...valid, name: "Novo" });

    await expect(getBotSettings(TENANT)).resolves.toMatchObject({
      name: "Novo",
    });
    expect(findMock).toHaveBeenCalledTimes(1);
  });

  it("does not touch the repository on invalid input", async () => {
    await expect(
      updateBotSettings(TENANT, { ...valid, gender: "x" }),
    ).rejects.toThrow(InvalidSettingsError);
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe("resolvePersonaTexts", () => {
  it("never breaks the chat when the settings read fails", async () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    findMock.mockRejectedValue(new Error("pg down"));

    const texts = await resolvePersonaTexts(TENANT);

    expect(texts).toEqual(buildPersonaTexts(DEFAULT_BOT_SETTINGS));
  });
});
