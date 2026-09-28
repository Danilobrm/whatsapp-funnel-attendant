import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./settings.repository.js", () => ({
  findBotSettings: vi.fn(),
  saveBotSettings: vi.fn(),
}));

const repository = await import("./settings.repository.js");
const { BOT_PERSONALITIES } = await import("./settings.types.js");
const {
  DEFAULT_BOT_SETTINGS,
  InvalidSettingsError,
  buildPersonaTexts,
  getBotSettings,
  invalidateBotSettingsCache,
  parseBotSettings,
  resolvePersonaTexts,
  settingsOptions,
  updateBotSettings,
} = await import("./settings.service.js");

import { asTenantId } from "../tenants/tenant.types.js";

const TENANT = asTenantId(1);

const findMock = repository.findBotSettings as ReturnType<typeof vi.fn>;
const saveMock = repository.saveBotSettings as ReturnType<typeof vi.fn>;

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

describe("parseBotSettings", () => {
  it("accepts and trims a valid payload", () => {
    expect(parseBotSettings({ ...valid, name: "  Nina  " })).toEqual(valid);
  });

  it("dedupes languages", () => {
    const parsed = parseBotSettings({
      ...valid,
      languages: ["pt-BR", "pt-BR"],
    });
    expect(parsed.languages).toEqual(["pt-BR"]);
  });

  it.each([
    [{ ...valid, name: "   " }, "name_required"],
    [{ ...valid, name: "x".repeat(61) }, "name_too_long"],
    [{ ...valid, personality: "sarcastic" }, "unknown_personality"],
    [{ ...valid, gender: "robot" }, "unknown_gender"],
    [{ ...valid, languages: [] }, "languages_required"],
    [{ ...valid, languages: ["fr-FR"] }, "unsupported_language"],
  ])("rejects %o with code %s", (input, code) => {
    expect(() => parseBotSettings(input)).toThrow(InvalidSettingsError);
    try {
      parseBotSettings(input);
    } catch (err) {
      expect((err as InstanceType<typeof InvalidSettingsError>).code).toBe(
        code,
      );
    }
  });

  it("rejects a missing payload instead of crashing", () => {
    expect(() => parseBotSettings(undefined)).toThrow(InvalidSettingsError);
  });
});

describe("buildPersonaTexts", () => {
  it("inflects the role noun by gender", () => {
    expect(
      buildPersonaTexts({ ...valid, gender: "female" }).greeting,
    ).toContain("a atendente virtual");
    expect(buildPersonaTexts({ ...valid, gender: "male" }).greeting).toContain(
      "o atendente virtual",
    );
    expect(
      buildPersonaTexts({ ...valid, gender: "neutral" }).greeting,
    ).toContain("atendente virtual");
  });

  it("uses the configured name", () => {
    expect(buildPersonaTexts({ ...valid, name: "Zé" }).greeting).toContain(
      "Zé",
    );
  });

  it("changes tone per personality", () => {
    const friendly = buildPersonaTexts({ ...valid, personality: "friendly" });
    const objective = buildPersonaTexts({ ...valid, personality: "objective" });

    expect(friendly.greeting).not.toBe(objective.greeting);
    expect(friendly.fallback).not.toBe(objective.fallback);
    expect(objective.greeting.length).toBeLessThan(friendly.greeting.length);
  });

  it("falls back to the default name when the name is blank", () => {
    expect(buildPersonaTexts({ ...valid, name: "  " }).greeting).toContain(
      DEFAULT_BOT_SETTINGS.name,
    );
  });
});

describe("buildPersonaTexts — identidade", () => {
  it("answers who the bot is with the configured name and role", () => {
    const texts = buildPersonaTexts({ ...valid, name: "Nina" });

    expect(texts.identity).toContain("Nina");
    expect(texts.identity).toContain("a atendente virtual");
  });

  it("inflects the identity role noun by gender", () => {
    expect(buildPersonaTexts({ ...valid, gender: "male" }).identity).toContain(
      "o atendente virtual",
    );
    expect(
      buildPersonaTexts({ ...valid, gender: "neutral" }).identity,
    ).toContain("atendente virtual");
  });

  it("changes the identity tone per personality", () => {
    const friendly = buildPersonaTexts({ ...valid, personality: "friendly" });
    const objective = buildPersonaTexts({ ...valid, personality: "objective" });

    expect(friendly.identity).not.toBe(objective.identity);
  });

  it("uses the default name when the name is blank", () => {
    expect(buildPersonaTexts({ ...valid, name: "  " }).identity).toContain(
      DEFAULT_BOT_SETTINGS.name,
    );
  });
});

// Regressão herdada do faq-chatbot: `friendly` carregava `answerLead:
// "Claro! "`, prefixado a TODA resposta — soava robótico. A persona expõe só
// os textos que o bot escreve sozinho, nenhum prefixo.
describe("buildPersonaTexts — no answer prefix", () => {
  it("exposes only the bot's own texts", () => {
    for (const personality of BOT_PERSONALITIES) {
      const texts = buildPersonaTexts({ ...valid, personality });
      expect(Object.keys(texts).sort()).toEqual([
        "fallback",
        "greeting",
        "identity",
        "junk",
      ]);
    }
  });
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
    vi.spyOn(console, "error").mockImplementation(() => {});
    findMock.mockRejectedValue(new Error("pg down"));

    const texts = await resolvePersonaTexts(TENANT);

    expect(texts).toEqual(buildPersonaTexts(DEFAULT_BOT_SETTINGS));
  });
});

describe("settingsOptions", () => {
  it("exposes pt-BR as the only supported language for now", () => {
    expect(settingsOptions().languages).toEqual(["pt-BR"]);
    expect(settingsOptions().personalities).toContain("technical");
    expect(settingsOptions().genders).toEqual(["neutral", "female", "male"]);
  });
});
