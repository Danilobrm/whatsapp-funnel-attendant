import { Module } from "@nestjs/common";

import { ConversationModule } from "../conversation/conversation.module.js";
import { MenuModule } from "../menu/menu.module.js";
import { OrderModule } from "../order/order.module.js";
import { StoreModule } from "../store/store.module.js";
import { TenantsModule } from "../tenants/tenants.module.js";
import { PublicMenuController } from "./controllers/publicMenu.controller.js";
import { MenuLinkRepository } from "./repositories/menuLink.repository.js";
import { MenuLinkService } from "./services/menuLink.service.js";

@Module({
  imports: [
    ConversationModule,
    MenuModule,
    OrderModule,
    StoreModule,
    TenantsModule,
  ],
  controllers: [PublicMenuController],
  providers: [MenuLinkRepository, MenuLinkService],
  exports: [MenuLinkService, MenuLinkRepository],
})
export class MenuLinkModule {}
