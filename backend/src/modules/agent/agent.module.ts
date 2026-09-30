import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module.js";
import { CustomerModule } from "../customer/customer.module.js";
import { MenuModule } from "../menu/menu.module.js";
import { MenuLinkModule } from "../menulink/menulink.module.js";
import { OrderModule } from "../order/order.module.js";
import { StoreModule } from "../store/store.module.js";
import { AgentContextService } from "./services/agent.context.js";
import { AgentService } from "./services/agent.service.js";
import { AgentToolExecutor } from "./tools/executor.js";

@Module({
  imports: [
    AiModule,
    CustomerModule,
    MenuModule,
    MenuLinkModule,
    OrderModule,
    StoreModule,
  ],
  providers: [AgentContextService, AgentToolExecutor, AgentService],
  exports: [AgentService],
})
export class AgentModule {}
