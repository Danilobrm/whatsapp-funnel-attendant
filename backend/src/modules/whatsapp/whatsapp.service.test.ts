import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../conversation/conversation.service.js", () => ({
  handleInboundMessage: vi.fn(),
}));
vi.mock("../tenants/tenant.service.js", () => ({
  resolveTenantByWhatsAppPhoneNumberId: vi.fn(),
}));
vi.mock("./whatsapp.client.js", () => ({
  sendWhatsAppText: vi.fn(),
}));

const conversation = await import("../conversation/conversation.service.js");
const tenants = await import("../tenants/tenant.service.js");
const client = await import("./whatsapp.client.js");
const { processWebhook } = await import("./whatsapp.service.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const handleInboundMessage = mock(conversation.handleInboundMessage);
const resolveTenant = mock(tenants.resolveTenantByWhatsAppPhoneNumberId);
const sendWhatsAppText = mock(client.sendWhatsAppText);

function webhook(messages: Record<string, unknown>[]) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "1234567890" },
              contacts: [
                { wa_id: "5511988887777", profile: { name: "Maria" } },
              ],
              messages,
            },
          },
        ],
      },
    ],
  };
}

const TEXT = {
  from: "5511988887777",
  id: "wamid.1",
  type: "text",
  text: { body: "quero pizza" },
};

beforeEach(() => {
  vi.resetAllMocks();
  resolveTenant.mockResolvedValue({ id: 3, slug: "demo", name: "Demo" });
  handleInboundMessage.mockResolvedValue({
    duplicate: false,
    replies: ["Qual sabor?"],
    provider: "agent",
  });
  sendWhatsAppText.mockResolvedValue({ sent: true });
});

describe("processWebhook", () => {
  it("routes the message to the tenant of the phone number and sends the reply", async () => {
    await processWebhook(webhook([TEXT]));

    expect(resolveTenant).toHaveBeenCalledWith("1234567890");
    expect(handleInboundMessage).toHaveBeenCalledWith(3, {
      channel: "whatsapp",
      contact: "5511988887777",
      contactName: "Maria",
      text: "quero pizza",
      externalId: "wamid.1",
      unsupportedType: null,
    });
    expect(sendWhatsAppText).toHaveBeenCalledWith(
      "1234567890",
      "5511988887777",
      "Qual sabor?",
    );
  });

  it("flags non-text messages as unsupported", async () => {
    await processWebhook(
      webhook([{ from: "5511988887777", id: "wamid.2", type: "audio" }]),
    );

    expect(handleInboundMessage).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ text: "", unsupportedType: "audio" }),
    );
  });

  it("sends nothing for a duplicated delivery", async () => {
    handleInboundMessage.mockResolvedValue({
      duplicate: true,
      replies: [],
      provider: null,
    });

    await processWebhook(webhook([TEXT]));

    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("isolates failures — one bad message does not block the next", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    handleInboundMessage
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        duplicate: false,
        replies: ["ok"],
        provider: "agent",
      });

    await processWebhook(webhook([TEXT, { ...TEXT, id: "wamid.3" }]));

    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
  });

  it("ignores payloads that carry no messages", async () => {
    await processWebhook({ object: "whatsapp_business_account", entry: [] });

    expect(handleInboundMessage).not.toHaveBeenCalled();
  });
});
