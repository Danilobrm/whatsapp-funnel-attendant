import { Module } from "@nestjs/common";

import { DashboardController } from "./controllers/dashboard.controller.js";

@Module({ controllers: [DashboardController] })
export class DashboardModule {}
