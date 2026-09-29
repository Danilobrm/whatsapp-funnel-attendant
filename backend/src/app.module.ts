import { Module } from "@nestjs/common";

import { CommonModule } from "./common/common.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { HealthModule } from "./modules/health/health.module.js";

/**
 * Raiz do Nest. As rotas ainda vivem no Express legado (`api/server.ts`),
 * montado por `bootstrap.ts`. Cada módulo portado entra aqui em `imports` e
 * sai do `server.ts`.
 */
@Module({ imports: [CommonModule, HealthModule, AuthModule] })
export class AppModule {}
