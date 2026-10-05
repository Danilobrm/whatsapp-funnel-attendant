import { Injectable, Logger } from "@nestjs/common";

import { WhatsAppClient } from "../../whatsapp/clients/whatsapp.client.js";
import { ConversationRepository } from "../repositories/conversation.repository.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";

@Injectable()
export class OutboundMessenger {
  private readonly logger = new Logger(OutboundMessenger.name);

  constructor(
    private readonly conversations: ConversationRepository,
    private readonly whatsapp: WhatsAppClient,
  ) {}

  /**
   * Mensagem ATIVA ao cliente (ex.: "pedido saiu para entrega"), fora do ciclo
   * pergunta-resposta. Canal-agnóstica: grava sempre na conversa (o simulador
   * mostra) e só vai para a Meta quando a conversa é de WhatsApp. É o único
   * ponto fora de `modules/whatsapp/` que decide canal.
   *
   * Devolve `false` quando a conversa não existe/não é deste tenant.
   *
   * Vive fora do `ConversationService` de propósito: `order`, `menulink` e o
   * agente dependem dele, e o `ConversationService` depende do agente — juntos
   * formariam um ciclo de módulos.
   */
  async sendOutbound(
    tenantId: TenantId,
    conversationId: number,
    text: string,
  ): Promise<boolean> {
    const target = await this.conversations.findConversationTarget(
      tenantId,
      conversationId,
    );
    if (!target) return false;

    await this.conversations.insertMessage(
      tenantId,
      conversationId,
      "outbound",
      text,
      null,
    );

    if (target.channel === "whatsapp") {
      if (!target.whatsappPhoneNumberId) {
        this.logger.warn(
          `tenant ${tenantId} sem whatsapp_phone_number_id — mensagem não enviada.`,
        );
        return true;
      }
      await this.whatsapp.sendWhatsAppText(
        target.whatsappPhoneNumberId,
        target.contact,
        text,
      );
    }
    return true;
  }
}
