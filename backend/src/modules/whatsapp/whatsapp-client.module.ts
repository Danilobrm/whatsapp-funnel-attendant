import { Module } from "@nestjs/common";

import { WhatsAppClient } from "./clients/whatsapp.client.js";

/**
 * Só o cliente HTTP da Graph API, em módulo próprio: o `ConversationModule`
 * precisa dele para enviar mensagens ativas, e o `WhatsAppModule` (webhook)
 * precisa do `InboundModule` — que depende da conversa. Separar quebra o ciclo.
 */
@Module({ providers: [WhatsAppClient], exports: [WhatsAppClient] })
export class WhatsAppClientModule {}
