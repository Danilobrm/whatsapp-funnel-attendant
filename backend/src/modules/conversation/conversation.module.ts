import { Module } from "@nestjs/common";

import { WhatsAppClientModule } from "../whatsapp/whatsapp-client.module.js";
import { ConversationRepository } from "./repositories/conversation.repository.js";
import { OutboundMessenger } from "./services/outbound.service.js";

/** Dados da conversa + envio ativo (folha do grafo: nada de agente/pedido aqui). */
@Module({
  imports: [WhatsAppClientModule],
  providers: [ConversationRepository, OutboundMessenger],
  exports: [ConversationRepository, OutboundMessenger],
})
export class ConversationModule {}
