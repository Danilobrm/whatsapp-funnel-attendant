import { Module } from "@nestjs/common";

import { PublicMenuController } from "./controllers/publicMenu.controller.js";

@Module({ controllers: [PublicMenuController] })
export class MenuLinkModule {}
