import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = { insertMessage: vi.fn(), findConversationTarget: vi.fn() };
const whatsappClient = { sendWhatsAppText: vi.fn() };

const { OutboundMessenger } = await import("./outbound.service.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const insertMessage = mock(repo.insertMessage);

const messenger = new OutboundMessenger(repo as never, whatsappClient as never);
const sendOutbound = messenger.sendOutbound.bind(messenger);

const TENANT = asTenantId(7);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("sendOutbound", () => {
  const findConversationTarget = mock(repo.findConversationTarget);
  const sendWhatsAppText = mock(whatsappClient.sendWhatsAppText);

  it("simulador: grava a mensagem e NÃO chama a Meta", async () => {
    findConversationTarget.mockResolvedValue({
      channel: "simulator",
      contact: "admin-1",
      whatsappPhoneNumberId: null,
    });
    insertMessage.mockResolvedValue(true);

    await expect(sendOutbound(TENANT, 3, "Pedido #1 confirmado")).resolves.toBe(
      true,
    );

    expect(insertMessage).toHaveBeenCalledWith(
      TENANT,
      3,
      "outbound",
      "Pedido #1 confirmado",
      null,
    );
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("whatsapp: grava e envia do número da loja para o contato", async () => {
    findConversationTarget.mockResolvedValue({
      channel: "whatsapp",
      contact: "5511999999999",
      whatsappPhoneNumberId: "PNID",
    });
    insertMessage.mockResolvedValue(true);

    await sendOutbound(TENANT, 3, "Saiu para entrega");

    expect(insertMessage).toHaveBeenCalled();
    expect(sendWhatsAppText).toHaveBeenCalledWith(
      "PNID",
      "5511999999999",
      "Saiu para entrega",
    );
  });

  it("conversa de outro tenant/inexistente: não grava nada", async () => {
    findConversationTarget.mockResolvedValue(null);

    await expect(sendOutbound(TENANT, 3, "x")).resolves.toBe(false);
    expect(insertMessage).not.toHaveBeenCalled();
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });
});
