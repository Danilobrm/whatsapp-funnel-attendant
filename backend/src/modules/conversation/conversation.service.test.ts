import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./conversation.repository.js", () => ({
  upsertConversation: vi.fn(),
  insertMessage: vi.fn(),
  findRecentMessages: vi.fn(),
}));
vi.mock("../agent/agent.service.js", () => ({
  generateAgentReply: vi.fn(),
}));
vi.mock("../settings/settings.repository.js", () => ({
  findBotSettings: vi.fn(),
  saveBotSettings: vi.fn(),
}));
vi.mock("../tenants/tenant.repository.js", () => ({
  findTenantById: vi.fn(),
}));

const repo = await import("./conversation.repository.js");
const agent = await import("../agent/agent.service.js");
const settingsRepo = await import("../settings/settings.repository.js");
const tenantRepo = await import("../tenants/tenant.repository.js");
const { invalidateBotSettingsCache, buildPersonaTexts, DEFAULT_BOT_SETTINGS } =
  await import("../settings/settings.service.js");
const { handleInboundMessage, CONVERSATION_IDLE_MS, UNSUPPORTED_MEDIA_REPLY } =
  await import("./conversation.service.js");
const { asTenantId } = await import("../tenants/tenant.types.js");
const { InvalidInputError } = await import("../errors/invalidInput.error.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const upsertConversation = mock(repo.upsertConversation);
const insertMessage = mock(repo.insertMessage);
const findRecentMessages = mock(repo.findRecentMessages);
const generateAgentReply = mock(agent.generateAgentReply);
const findBotSettings = mock(settingsRepo.findBotSettings);
const findTenantById = mock(tenantRepo.findTenantById);

const TENANT = asTenantId(7);
const PERSONA = buildPersonaTexts(DEFAULT_BOT_SETTINGS);

function message(text: string, extra: Record<string, unknown> = {}) {
  return {
    channel: "whatsapp" as const,
    contact: "5511999999999",
    text,
    ...extra,
  };
}

function freshConversation() {
  upsertConversation.mockResolvedValue({ id: 1, previousMessageAt: null });
}

function ongoingConversation() {
  upsertConversation.mockResolvedValue({
    id: 1,
    previousMessageAt: new Date(Date.now() - 60_000),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  invalidateBotSettingsCache();
  insertMessage.mockResolvedValue(true);
  findBotSettings.mockResolvedValue(null);
  findRecentMessages.mockResolvedValue([]);
  findTenantById.mockResolvedValue({ id: TENANT, slug: "demo", name: "Demo" });
});

describe("handleInboundMessage — porteiro", () => {
  it("answers a greeting at conversation start with the persona, no LLM", async () => {
    freshConversation();

    const result = await handleInboundMessage(TENANT, message("oi, tudo bem?"));

    expect(result).toEqual({
      duplicate: false,
      replies: [PERSONA.greeting],
      provider: "persona",
    });
    expect(generateAgentReply).not.toHaveBeenCalled();
  });

  it("answers junk at conversation start with the persona", async () => {
    freshConversation();

    const result = await handleInboundMessage(TENANT, message("kkkk"));

    expect(result.replies).toEqual([PERSONA.junk]);
    expect(generateAgentReply).not.toHaveBeenCalled();
  });

  it("answers identity with the persona even mid-conversation", async () => {
    ongoingConversation();

    const result = await handleInboundMessage(TENANT, message("quem é você?"));

    expect(result.replies).toEqual([PERSONA.identity]);
    expect(generateAgentReply).not.toHaveBeenCalled();
  });

  // Regressão que o porteiro herdado causaria: no meio de um pedido, "ok" e
  // "obrigado" respondem ao bot. Tratá-los como saudação/lixo quebra o fluxo.
  it.each(["ok", "obrigado", "blz"])(
    "sends %j to the agent mid-conversation",
    async (text) => {
      ongoingConversation();
      generateAgentReply.mockResolvedValue({ reply: "Perfeito!" });

      const result = await handleInboundMessage(TENANT, message(text));

      expect(generateAgentReply).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        replies: ["Perfeito!"],
        provider: "agent",
      });
    },
  );

  it("treats a conversation idle past the threshold as a new start", async () => {
    upsertConversation.mockResolvedValue({
      id: 1,
      previousMessageAt: new Date(Date.now() - CONVERSATION_IDLE_MS - 1000),
    });

    const result = await handleInboundMessage(TENANT, message("bom dia"));

    expect(result.replies).toEqual([PERSONA.greeting]);
  });
});

describe("handleInboundMessage — agente", () => {
  it("passes the tenant name, persona and history to the agent", async () => {
    freshConversation();
    const history = [
      { direction: "inbound", body: "quero uma pizza", createdAt: "t" },
    ];
    findRecentMessages.mockResolvedValue(history);
    generateAgentReply.mockResolvedValue({ reply: "Qual sabor?" });

    await handleInboundMessage(TENANT, message("quero uma pizza"));

    expect(findRecentMessages).toHaveBeenCalledWith(TENANT, 1, 20);
    expect(generateAgentReply).toHaveBeenCalledWith({
      businessName: "Demo",
      settings: DEFAULT_BOT_SETTINGS,
      history,
    });
  });

  it("falls back to the persona when the agent has no reply", async () => {
    freshConversation();
    generateAgentReply.mockResolvedValue({ reply: null });

    const result = await handleInboundMessage(TENANT, message("quero pizza"));

    expect(result).toMatchObject({
      replies: [PERSONA.fallback],
      provider: "persona",
    });
  });

  it("records the inbound message before deciding, then the reply", async () => {
    freshConversation();
    generateAgentReply.mockResolvedValue({ reply: "Qual sabor?" });

    await handleInboundMessage(
      TENANT,
      message("quero pizza", { externalId: "wamid.1" }),
    );

    expect(insertMessage.mock.calls).toEqual([
      [TENANT, 1, "inbound", "quero pizza", "wamid.1"],
      [TENANT, 1, "outbound", "Qual sabor?", null],
    ]);
  });
});

describe("handleInboundMessage — robustez", () => {
  // A Meta reenvia o webhook quando não recebe 200 a tempo.
  it("does not answer a duplicated external id", async () => {
    freshConversation();
    insertMessage.mockResolvedValueOnce(false);

    const result = await handleInboundMessage(
      TENANT,
      message("quero pizza", { externalId: "wamid.1" }),
    );

    expect(result).toEqual({ duplicate: true, replies: [], provider: null });
    expect(generateAgentReply).not.toHaveBeenCalled();
  });

  it("keeps the reply when recording it fails", async () => {
    freshConversation();
    insertMessage
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("pg"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await handleInboundMessage(TENANT, message("oi"));

    expect(result.replies).toEqual([PERSONA.greeting]);
  });

  it("replies with a fixed notice for unsupported media, without the agent", async () => {
    freshConversation();

    const result = await handleInboundMessage(
      TENANT,
      message("", { unsupportedType: "audio", externalId: "wamid.2" }),
    );

    expect(result.replies).toEqual([UNSUPPORTED_MEDIA_REPLY]);
    expect(insertMessage.mock.calls[0]).toEqual([
      TENANT,
      1,
      "inbound",
      "[audio]",
      "wamid.2",
    ]);
    expect(generateAgentReply).not.toHaveBeenCalled();
  });

  it("uses default persona when the settings read fails", async () => {
    freshConversation();
    findBotSettings.mockRejectedValue(new Error("pg down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await handleInboundMessage(TENANT, message("oi"));

    expect(result.replies).toEqual([PERSONA.greeting]);
  });

  it("rejects an empty text with a typed error", async () => {
    await expect(
      handleInboundMessage(TENANT, message("   ")),
    ).rejects.toBeInstanceOf(InvalidInputError);
    expect(upsertConversation).not.toHaveBeenCalled();
  });
});
