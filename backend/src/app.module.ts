import { Module } from "@nestjs/common";

import { CommonModule } from "./common/common.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { MenuModule } from "./modules/menu/menu.module.js";
import { SettingsModule } from "./modules/settings/settings.module.js";
import { StoreModule } from "./modules/store/store.module.js";

/**
 * Raiz do Nest. As rotas ainda vivem no Express legado (`api/server.ts`),
 * montado por `bootstrap.ts`. Cada módulo portado entra aqui em `imports` e
 * sai do `server.ts`.
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
  ],
})
export class AppModule {}
