import { describe, expect, it } from "vitest";

import { buildSystemPrompt, historyToTurns } from "./agent.prompt.js";

import type { BotSettings } from "../settings/settings.types.js";

const SETTINGS: BotSettings = {
  name: "Nina",
  personality: "friendly",
  gender: "female",
  languages: ["pt-BR"],
};

describe("buildSystemPrompt", () => {
  it("names the bot and the restaurant", () => {
    const prompt = buildSystemPrompt({
      businessName: "Pizzaria Demo",
      settings: SETTINGS,
    });

    expect(prompt).toContain("Nina");
    expect(prompt).toContain("Pizzaria Demo");
  });

  // Enquanto não existe cardápio no sistema, inventar preço é o pior erro
  // possível do bot — o restaurante teria que honrar ou desmentir.
  it("forbids inventing menu data", () => {
    const prompt = buildSystemPrompt({
      businessName: "X",
      settings: SETTINGS,
    });

    expect(prompt).toMatch(/Não invente/);
  });

  it("changes tone per personality", () => {
    const friendly = buildSystemPrompt({
      businessName: "X",
      settings: SETTINGS,
    });
    const objective = buildSystemPrompt({
      businessName: "X",
      settings: { ...SETTINGS, personality: "objective" },
    });

    expect(friendly).not.toBe(objective);
  });
});

describe("historyToTurns", () => {
  it("maps inbound to user and outbound to assistant, keeping order", () => {
    expect(
      historyToTurns([
        { direction: "inbound", body: "oi", createdAt: "t1" },
        { direction: "outbound", body: "olá!", createdAt: "t2" },
        { direction: "inbound", body: "tem pizza?", createdAt: "t3" },
      ]),
    ).toEqual([
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá!" },
      { role: "user", content: "tem pizza?" },
    ]);
  });
});
