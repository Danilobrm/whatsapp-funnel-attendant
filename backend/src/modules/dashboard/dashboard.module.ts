import { Module } from "@nestjs/common";

import { MenuLinkModule } from "../menulink/menulink.module.js";
import { StoreModule } from "../store/store.module.js";
import { DashboardController } from "./controllers/dashboard.controller.js";
import { DashboardRepository } from "./repositories/dashboard.repository.js";
import { DashboardService } from "./services/dashboard.service.js";

@Module({
  imports: [MenuLinkModule, StoreModule],
  controllers: [DashboardController],
  providers: [DashboardRepository, DashboardService],
})
export class DashboardModule {}
