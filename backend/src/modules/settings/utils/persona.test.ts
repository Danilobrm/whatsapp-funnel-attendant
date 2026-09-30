import { describe, expect, it } from "vitest";

import { InvalidSettingsError } from "../errors/settings.errors.js";
import { BOT_PERSONALITIES } from "../types/settings.types.js";
import {
  DEFAULT_BOT_SETTINGS,
  buildPersonaTexts,
  parseBotSettings,
  settingsOptions,
} from "./persona.js";

const valid = {
  name: "Nina",
  personality: "friendly" as const,
  gender: "female" as const,
  languages: ["pt-BR"],
};

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

describe("settingsOptions", () => {
  it("exposes pt-BR as the only supported language for now", () => {
    expect(settingsOptions().languages).toEqual(["pt-BR"]);
    expect(settingsOptions().personalities).toContain("technical");
    expect(settingsOptions().genders).toEqual(["neutral", "female", "male"]);
  });
});
