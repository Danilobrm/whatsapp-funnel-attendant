import { Module } from "@nestjs/common";

import { ConversationModule } from "../conversation/conversation.module.js";
import { MenuModule } from "../menu/menu.module.js";
import { StoreModule } from "../store/store.module.js";
import { OrderController } from "./controllers/order.controller.js";
import { OrderEvents } from "./events/order.events.js";
import { CartRepository } from "./repositories/cart.repository.js";
import { OrderRepository } from "./repositories/order.repository.js";
import { CartService } from "./services/cart.service.js";
import { OrderService } from "./services/order.service.js";

@Module({
  imports: [ConversationModule, MenuModule, StoreModule],
  controllers: [OrderController],
  providers: [
    OrderRepository,
    CartRepository,
    OrderEvents,
    OrderService,
    CartService,
  ],
  exports: [OrderService, CartService, CartRepository, OrderRepository],
})
export class OrderModule {}
