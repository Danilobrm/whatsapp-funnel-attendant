import { beforeEach, describe, expect, it, vi } from "vitest";

const ollamaCtor = vi.fn();
const anthropicCtor = vi.fn();
const openaiCtor = vi.fn();
const geminiCtor = vi.fn();

vi.mock("@langchain/ollama", () => ({
  ChatOllama: class {
    constructor(config: unknown) {
      ollamaCtor(config);
    }
  },
}));
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: class {
    constructor(config: unknown) {
      anthropicCtor(config);
    }
  },
}));
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    constructor(config: unknown) {
      openaiCtor(config);
    }
  },
}));

vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: class {
    constructor(config: unknown) {
      geminiCtor(config);
    }
  },
}));

const { env } = await import("../../../config/env.js");
const { LlmClientFactory, LlmNotConfiguredError } =
  await import("./llm-client.js");
const factory = new LlmClientFactory();
const createChatLlm = factory.createChatLlm.bind(factory);

beforeEach(() => {
  vi.clearAllMocks();
  env.llm.provider = "ollama";
  env.llm.model = "llama3.2";
  env.llm.anthropicApiKey = "";
  env.llm.openaiApiKey = "";
  env.llm.geminiApiKey = "";
});

describe("createChatLlm", () => {
  // O agente roda no hot path da conversa: sem prazo, um Ollama travado deixa
  // o cliente do WhatsApp sem resposta.
  it("ollama: installs a fetch with timeout", async () => {
    await createChatLlm();

    const config = ollamaCtor.mock.calls[0]?.[0] as {
      fetch?: unknown;
      model?: string;
    };
    expect(typeof config.fetch).toBe("function");
    expect(config.model).toBe("llama3.2");
  });

  it("anthropic: uses the key, the model and a client timeout", async () => {
    env.llm.provider = "anthropic";
    env.llm.model = "claude-sonnet-5-5";
    env.llm.anthropicApiKey = "sk-ant";

    await createChatLlm();

    expect(anthropicCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-5-5",
        apiKey: "sk-ant",
        clientOptions: { timeout: env.llm.timeoutMs },
      }),
    );
    expect(ollamaCtor).not.toHaveBeenCalled();
  });

  it("openai: uses the key, the model and a timeout", async () => {
    env.llm.provider = "openai";
    env.llm.model = "gpt-4o-mini";
    env.llm.openaiApiKey = "sk-oai";

    await createChatLlm();

    expect(openaiCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        apiKey: "sk-oai",
        timeout: env.llm.timeoutMs,
      }),
    );
  });

  it("gemini: uses the key and the model", async () => {
    env.llm.provider = "gemini";
    env.llm.model = "gemini-2.5-flash";
    env.llm.geminiApiKey = "gem-key";

    await createChatLlm();

    expect(geminiCtor).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-flash", apiKey: "gem-key" }),
    );
    expect(ollamaCtor).not.toHaveBeenCalled();
  });

  it("hosted provider without key fails with a typed error", async () => {
    env.llm.provider = "anthropic";
    await expect(createChatLlm()).rejects.toBeInstanceOf(LlmNotConfiguredError);

    env.llm.provider = "openai";
    await expect(createChatLlm()).rejects.toBeInstanceOf(LlmNotConfiguredError);
  });
});
