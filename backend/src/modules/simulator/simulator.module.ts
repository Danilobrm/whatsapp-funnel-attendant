import { Module } from "@nestjs/common";

import { ConversationModule } from "../conversation/conversation.module.js";
import { InboundModule } from "../conversation/inbound.module.js";
import { CustomerModule } from "../customer/customer.module.js";
import { MenuModule } from "../menu/menu.module.js";
import { OrderModule } from "../order/order.module.js";
import { StoreModule } from "../store/store.module.js";
import { SimulatorController } from "./controllers/simulator.controller.js";
import { SimulatorService } from "./services/simulator.service.js";

@Module({
  imports: [
    InboundModule,
    ConversationModule,
    CustomerModule,
    MenuModule,
    OrderModule,
    StoreModule,
  ],
  controllers: [SimulatorController],
  providers: [SimulatorService],
})
export class SimulatorModule {}
