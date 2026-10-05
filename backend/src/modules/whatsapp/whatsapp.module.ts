import { Module } from "@nestjs/common";

import { InboundModule } from "../conversation/inbound.module.js";
import { TenantsModule } from "../tenants/tenants.module.js";
import { WhatsAppController } from "./controllers/whatsapp.controller.js";
import { WhatsAppService } from "./services/whatsapp.service.js";
import { WhatsAppClientModule } from "./whatsapp-client.module.js";

@Module({
  imports: [InboundModule, TenantsModule, WhatsAppClientModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
})
export class WhatsAppModule {}
