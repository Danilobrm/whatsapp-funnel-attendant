import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const bindTools = vi.fn((_tools: unknown) => ({ invoke }));
const createChatLlm = vi.fn();
const executeTool = vi.fn();
const loadPromptContext = vi.fn();

const { AgentService, MAX_TOOL_ITERATIONS } =
  await import("./agent.service.js");
const agentService = new AgentService(
  { createChatLlm: () => createChatLlm() } as never,
  {
    loadPromptContext: (...args: unknown[]) => loadPromptContext(...args),
  } as never,
  { executeTool: (...args: unknown[]) => executeTool(...args) } as never,
);
const generateAgentReply = agentService.generateAgentReply.bind(agentService);
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const INPUT = {
  tenantId: asTenantId(3),
  conversationId: 9,
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

const toolCall = (name: string, args: unknown = {}, id?: string) => ({
  content: "",
  tool_calls: [{ name, args, id }],
});

beforeEach(() => {
  vi.resetAllMocks();
  bindTools.mockImplementation((_tools: unknown) => ({ invoke }));
  createChatLlm.mockResolvedValue({ bindTools });
  loadPromptContext.mockResolvedValue({
    store: undefined,
    menuSummary: null,
    customer: null,
  });
  vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

describe("generateAgentReply — conversa", () => {
  it("returns the model text", async () => {
    invoke.mockResolvedValue({ content: "  Tem sim! Qual sabor?  " });

    await expect(generateAgentReply(INPUT)).resolves.toEqual({
      reply: "Tem sim! Qual sabor?",
      trace: [],
    });
  });

  it("sends the system prompt followed by the history and binds the tools", async () => {
    invoke.mockResolvedValue({ content: "ok" });

    await generateAgentReply(INPUT);

    const tools = (bindTools.mock.calls as unknown[][])[0]?.[0] as {
      function: { name: string };
    }[];
    expect(tools.map((t) => t.function.name)).toContain("place_order");

    const messages = invoke.mock.calls[0]?.[0] as { content: string }[];
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain("Pizzaria Demo");
    expect(messages[1]?.content).toBe("tem pizza?");
  });

  it("passes a per-call timeout to the model (not every SDK has its own option)", async () => {
    invoke.mockResolvedValue({ content: "ok" });

    await generateAgentReply(INPUT);

    const { env } = await import("../../../config/env.js");
    expect(invoke.mock.calls[0]?.[1]).toEqual({ timeout: env.llm.timeoutMs });
  });

  it("joins array content parts", async () => {
    invoke.mockResolvedValue({ content: [{ text: "Tem " }, { text: "sim" }] });

    await expect(generateAgentReply(INPUT)).resolves.toMatchObject({
      reply: "Tem sim",
    });
  });

  // O cliente no WhatsApp não pode ficar sem resposta porque o modelo caiu.
  it("never throws — a model failure becomes null", async () => {
    invoke.mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(generateAgentReply(INPUT)).resolves.toEqual({
      reply: null,
      trace: [],
    });
  });

  it("never throws — a missing API key / provider failure becomes null", async () => {
    createChatLlm.mockRejectedValue(new Error("llm_not_configured:anthropic"));

    await expect(generateAgentReply(INPUT)).resolves.toMatchObject({
      reply: null,
    });
  });

  it("never throws — a model without tool support becomes null", async () => {
    createChatLlm.mockResolvedValue({});

    await expect(generateAgentReply(INPUT)).resolves.toMatchObject({
      reply: null,
    });
  });

  it("never throws — a failure loading the context becomes null", async () => {
    loadPromptContext.mockRejectedValue(new Error("db down"));

    await expect(generateAgentReply(INPUT)).resolves.toMatchObject({
      reply: null,
    });
  });

  it("treats an empty completion as no reply", async () => {
    invoke.mockResolvedValue({ content: "   " });

    await expect(generateAgentReply(INPUT)).resolves.toMatchObject({
      reply: null,
    });
  });
});

describe("generateAgentReply — ferramentas", () => {
  it("runs a tool, feeds the result back and returns the final text", async () => {
    invoke
      .mockResolvedValueOnce(
        toolCall("search_menu", { query: "calabresa" }, "c1"),
      )
      .mockResolvedValueOnce({ content: "Temos a Calabresa, R$ 45,00." });
    executeTool.mockResolvedValue({ result: { ok: true, items: [] } });

    const out = await generateAgentReply(INPUT);

    expect(executeTool).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: INPUT.tenantId,
        conversationId: 9,
      }),
      "search_menu",
      { query: "calabresa" },
    );
    expect(out.reply).toBe("Temos a Calabresa, R$ 45,00.");
    expect(out.trace).toEqual([
      {
        name: "search_menu",
        args: { query: "calabresa" },
        result: { ok: true, items: [] },
      },
    ]);

    const second = invoke.mock.calls[1]?.[0] as {
      content: string;
      tool_call_id?: string;
    }[];
    const toolMessage = second.at(-1);
    expect(toolMessage?.tool_call_id).toBe("c1");
    expect(JSON.parse(toolMessage?.content ?? "{}")).toEqual({
      ok: true,
      items: [],
    });
  });

  it("gives an id to tool calls the provider did not id (Ollama)", async () => {
    invoke
      .mockResolvedValueOnce(toolCall("view_cart"))
      .mockResolvedValueOnce({ content: "ok" });
    executeTool.mockResolvedValue({ result: { ok: true } });

    await generateAgentReply(INPUT);

    const second = invoke.mock.calls[1]?.[0] as { tool_call_id?: string }[];
    expect(second.at(-1)?.tool_call_id).toBeTruthy();
  });

  // O resumo é texto do SISTEMA: o modelo não pode parafrasear valores.
  it("ends the turn with the system text when a tool sets finalReply", async () => {
    invoke.mockResolvedValueOnce({
      content: "Vou mandar o resumo!",
      tool_calls: [{ name: "request_confirmation", args: {}, id: "c1" }],
    });
    executeTool.mockResolvedValue({
      result: { ok: true, summarySent: true },
      finalReply: "Resumo do seu pedido:\n...\nPosso confirmar?",
    });

    const out = await generateAgentReply(INPUT);

    expect(out.reply).toBe("Resumo do seu pedido:\n...\nPosso confirmar?");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  // Pedir o resumo e fechar o pedido na MESMA mensagem pularia a confirmação.
  it("skips the remaining tool calls after a finalReply (no summary + place_order in one turn)", async () => {
    invoke.mockResolvedValueOnce({
      content: "",
      tool_calls: [
        { name: "request_confirmation", args: {}, id: "c1" },
        { name: "place_order", args: {}, id: "c2" },
      ],
    });
    executeTool.mockResolvedValueOnce({
      result: { ok: true },
      finalReply: "Resumo",
    });

    await generateAgentReply(INPUT);

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool.mock.calls[0]?.[1]).toBe("request_confirmation");
  });

  it("caps the tool loop and falls back instead of spinning", async () => {
    invoke.mockResolvedValue(toolCall("view_cart"));
    executeTool.mockResolvedValue({ result: { ok: true } });

    const out = await generateAgentReply(INPUT);

    expect(out.reply).toBeNull();
    expect(executeTool).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS);
    expect(out.trace).toHaveLength(MAX_TOOL_ITERATIONS);
  });

  it("falls back when the total time budget is spent", async () => {
    const { env } = await import("../../../config/env.js");
    const original = env.llm.timeoutMs;
    env.llm.timeoutMs = -1; // qualquer tempo decorrido estoura o prazo
    try {
      invoke.mockResolvedValue({ content: "tarde demais" });
      const out = await generateAgentReply(INPUT);
      expect(out.reply).toBeNull();
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      env.llm.timeoutMs = original;
    }
  });

  it("keeps the trace of what already ran when the model fails mid-turn", async () => {
    invoke
      .mockResolvedValueOnce(toolCall("add_item", { item_id: 1 }, "c1"))
      .mockRejectedValueOnce(new Error("timeout"));
    executeTool.mockResolvedValue({ result: { ok: true } });

    const out = await generateAgentReply(INPUT);

    expect(out.reply).toBeNull();
    expect(out.trace.map((t) => t.name)).toEqual(["add_item"]);
  });
});
