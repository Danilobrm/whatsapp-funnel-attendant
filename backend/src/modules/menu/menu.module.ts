import { Module } from "@nestjs/common";

import { MenuController } from "./controllers/menu.controller.js";
import { MenuRepository } from "./repositories/menu.repository.js";
import { MenuService } from "./services/menu.service.js";
import { ProductImageStorage } from "./storage/imageStorage.js";

@Module({
  controllers: [MenuController],
  providers: [MenuRepository, MenuService, ProductImageStorage],
  exports: [MenuService, ProductImageStorage],
})
export class MenuModule {}
