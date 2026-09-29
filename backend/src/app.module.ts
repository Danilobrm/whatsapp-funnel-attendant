import { Module } from "@nestjs/common";

import { CommonModule } from "./common/common.module.js";

/**
 * Raiz do Nest. As rotas ainda vivem no Express legado (`api/server.ts`),
 * montado por `bootstrap.ts`. Cada módulo portado entra aqui em `imports` e
 * sai do `server.ts`.
 */
@Module({ imports: [CommonModule] })
export class AppModule {}
