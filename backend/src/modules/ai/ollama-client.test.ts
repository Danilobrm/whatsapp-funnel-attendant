import { describe, expect, it, vi } from "vitest";

const chatCtor = vi.fn();

vi.mock("@langchain/ollama", () => ({
  ChatOllama: class {
    constructor(config: unknown) {
      chatCtor(config);
    }
  },
}));

const { createChatLlm } = await import("./ollama-client.js");

describe("createChatLlm", () => {
  // O agente roda no hot path da conversa: sem prazo, um Ollama travado deixa
  // o cliente do WhatsApp sem resposta.
  it("installs a fetch with timeout", () => {
    createChatLlm();

    const config = chatCtor.mock.calls[0]?.[0] as { fetch?: unknown };
    expect(typeof config.fetch).toBe("function");
  });
});
