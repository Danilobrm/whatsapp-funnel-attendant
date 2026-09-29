import { Module } from "@nestjs/common";

import { StoreController } from "./controllers/store.controller.js";

@Module({ controllers: [StoreController] })
export class StoreModule {}
