import { Module } from "@nestjs/common";

import { OrderController } from "./controllers/order.controller.js";

@Module({ controllers: [OrderController] })
export class OrderModule {}
