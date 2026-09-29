import { Module } from "@nestjs/common";

import { MenuController } from "./controllers/menu.controller.js";

@Module({ controllers: [MenuController] })
export class MenuModule {}
