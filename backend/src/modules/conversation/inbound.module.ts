import { Module } from "@nestjs/common";

import { AgentModule } from "../agent/agent.module.js";
import { CustomerModule } from "../customer/customer.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { StoreModule } from "../store/store.module.js";
import { TenantsModule } from "../tenants/tenants.module.js";
import { ConversationModule } from "./conversation.module.js";
import { ConversationService } from "./services/conversation.service.js";

/** `handleInboundMessage`: a porta única de entrada de todo canal. */
@Module({
  imports: [
    ConversationModule,
    AgentModule,
    CustomerModule,
    SettingsModule,
    StoreModule,
    TenantsModule,
  ],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class InboundModule {}
