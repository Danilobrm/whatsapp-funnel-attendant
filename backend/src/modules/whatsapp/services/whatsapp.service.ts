import { Injectable, Logger } from "@nestjs/common";

import { ConversationService } from "../../conversation/services/conversation.service.js";
import { TenantService } from "../../tenants/services/tenant.service.js";
import { WhatsAppClient } from "../clients/whatsapp.client.js";
import { parseWebhookPayload } from "../utils/whatsapp.payload.js";
import type { WhatsAppInboundMessage } from "../utils/whatsapp.payload.js";

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly inbound: ConversationService,
    private readonly tenants: TenantService,
    private readonly client: WhatsAppClient,
  ) {}

  private async processMessage(message: WhatsAppInboundMessage): Promise<void> {
    const tenant = await this.tenants.resolveTenantByWhatsAppPhoneNumberId(
      message.phoneNumberId,
    );

    const isText = message.type === "text" && message.text !== null;
    const result = await this.inbound.handleInboundMessage(tenant.id, {
      channel: "whatsapp",
      contact: message.from,
      contactName: message.contactName,
      text: message.text ?? "",
      externalId: message.messageId,
      unsupportedType: isText ? null : message.type,
      location: message.location,
    });

    for (const reply of result.replies) {
      await this.client.sendWhatsAppText(
        message.phoneNumberId,
        message.from,
        reply,
      );
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
  async processWebhook(body: unknown): Promise<void> {
    for (const message of parseWebhookPayload(body)) {
      try {
        await this.processMessage(message);
      } catch (err) {
        this.logger.error(
          `falha ao processar ${message.messageId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
