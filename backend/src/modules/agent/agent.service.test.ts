import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("../ai/ollama-client.js", () => ({
  createChatLlm: () => ({ invoke }),
}));

const { generateAgentReply } = await import("./agent.service.js");

const INPUT = {
  businessName: "Pizzaria Demo",
  settings: {
    name: "Nina",
    personality: "friendly" as const,
    gender: "female" as const,
    languages: ["pt-BR"],
  },
  history: [
    { direction: "inbound" as const, body: "tem pizza?", createdAt: "t1" },
  ],
};

beforeEach(() => {
  invoke.mockReset();
});

describe("generateAgentReply", () => {
  it("returns the model text", async () => {
    invoke.mockResolvedValue({ content: "  Tem sim! Qual sabor?  " });

    await expect(generateAgentReply(INPUT)).resolves.toEqual({
      reply: "Tem sim! Qual sabor?",
    });
  });

  it("sends the system prompt followed by the history", async () => {
    invoke.mockResolvedValue({ content: "ok" });

    await generateAgentReply(INPUT);

    const messages = invoke.mock.calls[0]?.[0] as { content: string }[];
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain("Pizzaria Demo");
    expect(messages[1]?.content).toBe("tem pizza?");
  });

  it("joins array content parts", async () => {
    invoke.mockResolvedValue({ content: [{ text: "Tem " }, { text: "sim" }] });

    await expect(generateAgentReply(INPUT)).resolves.toEqual({
      reply: "Tem sim",
    });
  });

  // O cliente no WhatsApp não pode ficar sem resposta porque o modelo caiu.
  it("never throws — a model failure becomes null", async () => {
    invoke.mockRejectedValue(new Error("connect ECONNREFUSED"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(generateAgentReply(INPUT)).resolves.toEqual({ reply: null });
  });

  it("treats an empty completion as no reply", async () => {
    invoke.mockResolvedValue({ content: "   " });

    await expect(generateAgentReply(INPUT)).resolves.toEqual({ reply: null });
  });
});
