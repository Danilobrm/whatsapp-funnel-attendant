import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = {
  upsertConversation: vi.fn(),
  insertMessage: vi.fn(),
  findRecentMessages: vi.fn(),
  findConversationTarget: vi.fn(),
};
const agent = { generateAgentReply: vi.fn() };
const customerService = { resolveCustomer: vi.fn() };
const settingsRepo = { findBotSettings: vi.fn(), saveBotSettings: vi.fn() };
const tenantRepo = { findTenantById: vi.fn() };
const storeService = { getStoreSettings: vi.fn() };
const storeLocation = { setStoreLocation: vi.fn() };

const { SettingsService } =
  await import("../../settings/services/settings.service.js");
const { buildPersonaTexts, DEFAULT_BOT_SETTINGS } =
  await import("../../settings/utils/persona.js");
const {
  ConversationService,
  CONVERSATION_IDLE_MS,
  UNSUPPORTED_MEDIA_REPLY,
  OWNER_LOCATION_SAVED_REPLY,
  OWNER_LOCATION_NO_ADDRESS_REPLY,
  OWNER_LOCATION_FAILED_REPLY,
} = await import("./conversation.service.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");
const { InvalidInputError } =
  await import("../../errors/invalidInput.error.js");

const settingsService = new SettingsService(settingsRepo as never);
const invalidateBotSettingsCache =
  settingsService.invalidateBotSettingsCache.bind(settingsService);
const conversationService = new ConversationService(
  repo as never,
  agent as never,
  customerService as never,
  settingsService,
  storeService as never,
  storeLocation as never,
  tenantRepo as never,
);
const handleInboundMessage =
  conversationService.handleInboundMessage.bind(conversationService);

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const upsertConversation = mock(repo.upsertConversation);
const insertMessage = mock(repo.insertMessage);
const findRecentMessages = mock(repo.findRecentMessages);
const generateAgentReply = mock(agent.generateAgentReply);
const resolveCustomer = mock(customerService.resolveCustomer);
const findBotSettings = mock(settingsRepo.findBotSettings);
const findTenantById = mock(tenantRepo.findTenantById);
const getStoreSettings = mock(storeService.getStoreSettings);
const setStoreLocation = mock(storeLocation.setStoreLocation);

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
  resolveCustomer.mockResolvedValue(null);
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
      generateAgentReply.mockResolvedValue({ reply: "Perfeito!", trace: [] });

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
    const customer = {
      id: 5,
      phone: "5511999999999",
      name: "Ana",
      lastAddress: null,
    };
    resolveCustomer.mockResolvedValue(customer);
    generateAgentReply.mockResolvedValue({ reply: "Qual sabor?", trace: [] });

    await handleInboundMessage(
      TENANT,
      message("quero uma pizza", { contactName: "Ana" }),
    );

    expect(findRecentMessages).toHaveBeenCalledWith(TENANT, 1, 20);
    expect(resolveCustomer).toHaveBeenCalledWith(
      TENANT,
      "whatsapp",
      "5511999999999",
      "Ana",
    );
    expect(generateAgentReply).toHaveBeenCalledWith({
      tenantId: TENANT,
      conversationId: 1,
      businessName: "Demo",
      settings: DEFAULT_BOT_SETTINGS,
      history,
      customer,
      contactName: "Ana",
    });
  });

  it("returns the tool trace of the agent turn", async () => {
    freshConversation();
    const trace = [{ name: "view_cart", args: {}, result: { ok: true } }];
    generateAgentReply.mockResolvedValue({ reply: "Tudo certo", trace });

    const result = await handleInboundMessage(TENANT, message("e o carrinho?"));

    expect(result.trace).toEqual(trace);
  });

  it("keeps answering when the customer cannot be registered", async () => {
    freshConversation();
    resolveCustomer.mockResolvedValue(null);
    generateAgentReply.mockResolvedValue({ reply: "Oi!", trace: [] });

    const result = await handleInboundMessage(TENANT, message("quero pizza"));

    expect(result.replies).toEqual(["Oi!"]);
    expect(generateAgentReply).toHaveBeenCalledWith(
      expect.objectContaining({ customer: null }),
    );
  });

  it("falls back to the persona when the agent has no reply", async () => {
    freshConversation();
    generateAgentReply.mockResolvedValue({ reply: null, trace: [] });

    const result = await handleInboundMessage(TENANT, message("quero pizza"));

    expect(result).toMatchObject({
      replies: [PERSONA.fallback],
      provider: "persona",
    });
  });

  it("records the inbound message before deciding, then the reply", async () => {
    freshConversation();
    generateAgentReply.mockResolvedValue({ reply: "Qual sabor?", trace: [] });

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
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});

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

  describe("location message", () => {
    const LOCATION = { latitude: -16.25, longitude: -47.95 };
    const locationMessage = (contact: string) =>
      message("", {
        contact,
        unsupportedType: "location",
        location: LOCATION,
        externalId: "wamid.loc",
      });

    it("from the owner's number, saves the store location and confirms the address", async () => {
      freshConversation();
      getStoreSettings.mockResolvedValue({ ownerWhatsapp: "(11) 99999-9999" });
      setStoreLocation.mockResolvedValue({ address: "Rua 1, Luziânia - GO" });

      const result = await handleInboundMessage(
        TENANT,
        locationMessage("5511999999999"),
      );

      expect(setStoreLocation).toHaveBeenCalledWith(TENANT, -16.25, -47.95);
      expect(result.replies).toEqual([
        OWNER_LOCATION_SAVED_REPLY("Rua 1, Luziânia - GO"),
      ]);
      expect(generateAgentReply).not.toHaveBeenCalled();
    });

    it("from anyone else, changes nothing and answers with the media notice", async () => {
      freshConversation();
      getStoreSettings.mockResolvedValue({ ownerWhatsapp: "(11) 99999-9999" });

      const result = await handleInboundMessage(
        TENANT,
        locationMessage("5511988887777"),
      );

      expect(setStoreLocation).not.toHaveBeenCalled();
      expect(result.replies).toEqual([UNSUPPORTED_MEDIA_REPLY]);
    });

    it("without an owner number registered, nobody can set the location", async () => {
      freshConversation();
      getStoreSettings.mockResolvedValue({ ownerWhatsapp: null });

      const result = await handleInboundMessage(
        TENANT,
        locationMessage("5511999999999"),
      );

      expect(setStoreLocation).not.toHaveBeenCalled();
      expect(result.replies).toEqual([UNSUPPORTED_MEDIA_REPLY]);
    });

    it("tells the owner when the address could not be found", async () => {
      freshConversation();
      getStoreSettings.mockResolvedValue({ ownerWhatsapp: "11999999999" });
      setStoreLocation.mockResolvedValue({ address: null });

      const result = await handleInboundMessage(
        TENANT,
        locationMessage("5511999999999"),
      );

      expect(result.replies).toEqual([OWNER_LOCATION_NO_ADDRESS_REPLY]);
    });

    it("answers with a failure notice, never throws, when saving fails", async () => {
      freshConversation();
      getStoreSettings.mockResolvedValue({ ownerWhatsapp: "11999999999" });
      setStoreLocation.mockRejectedValue(new Error("pg down"));
      vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});

      const result = await handleInboundMessage(
        TENANT,
        locationMessage("5511999999999"),
      );

      expect(result.replies).toEqual([OWNER_LOCATION_FAILED_REPLY]);
    });

    it("a location without coordinates is plain unsupported media", async () => {
      freshConversation();

      const result = await handleInboundMessage(
        TENANT,
        message("", { unsupportedType: "location", externalId: "wamid.l2" }),
      );

      expect(getStoreSettings).not.toHaveBeenCalled();
      expect(result.replies).toEqual([UNSUPPORTED_MEDIA_REPLY]);
    });
  });

  it("uses default persona when the settings read fails", async () => {
    freshConversation();
    findBotSettings.mockRejectedValue(new Error("pg down"));
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});

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
