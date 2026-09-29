import { handleInboundMessage } from "../../conversation/services/conversation.service.js";
import { resolveTenantByWhatsAppPhoneNumberId } from "../../tenants/services/tenant.service.js";
import { sendWhatsAppText } from "../clients/whatsapp.client.js";
import { parseWebhookPayload } from "../utils/whatsapp.payload.js";

import type { WhatsAppInboundMessage } from "../utils/whatsapp.payload.js";

async function processMessage(message: WhatsAppInboundMessage): Promise<void> {
  const tenant = await resolveTenantByWhatsAppPhoneNumberId(
    message.phoneNumberId,
  );

  const isText = message.type === "text" && message.text !== null;
  const result = await handleInboundMessage(tenant.id, {
    channel: "whatsapp",
    contact: message.from,
    contactName: message.contactName,
    text: message.text ?? "",
    externalId: message.messageId,
    unsupportedType: isText ? null : message.type,
    location: message.location,
  });

  for (const reply of result.replies) {
    await sendWhatsAppText(message.phoneNumberId, message.from, reply);
  }
}

/**
 * Processa um webhook já autenticado. Roda DEPOIS do 200 ter sido enviado à
 * Meta (ver `whatsappController`), então não tem a quem devolver erro: cada
 * mensagem é isolada — uma falha é logada e não impede as seguintes.
 *
 * Sequencial de propósito: duas mensagens do mesmo cliente no mesmo webhook
 * precisam ser respondidas na ordem em que ele escreveu.
 */
export async function processWebhook(body: unknown): Promise<void> {
  for (const message of parseWebhookPayload(body)) {
    try {
      await processMessage(message);
    } catch (err) {
      console.error(
        `[whatsapp] falha ao processar ${message.messageId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
