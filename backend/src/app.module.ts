import { Module } from "@nestjs/common";

import { CommonModule } from "./common/common.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { MenuModule } from "./modules/menu/menu.module.js";
import { MenuLinkModule } from "./modules/menulink/menulink.module.js";
import { OrderModule } from "./modules/order/order.module.js";
import { WhatsAppModule } from "./modules/whatsapp/whatsapp.module.js";
import { SettingsModule } from "./modules/settings/settings.module.js";
import { SimulatorModule } from "./modules/simulator/simulator.module.js";
import { StoreModule } from "./modules/store/store.module.js";

/**
 * Raiz do Nest: `CommonModule` (guard global + filter) e um módulo por
 * contexto de negócio. Cada módulo dono do seu controller.
 */
@Module({
  imports: [
    CommonModule,
    HealthModule,
    AuthModule,
    SettingsModule,
    DashboardModule,
    StoreModule,
    MenuModule,
    SimulatorModule,
    OrderModule,
    MenuLinkModule,
    WhatsAppModule,
  ],
})
export class AppModule {}
