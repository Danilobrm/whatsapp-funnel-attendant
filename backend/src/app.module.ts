import { Module } from "@nestjs/common";

/**
 * Raiz do Nest. Vazio de propósito na Etapa 0: as rotas ainda vivem no Express
 * legado (`api/server.ts`), montado por `bootstrap.ts`. Cada módulo portado
 * entra aqui em `imports` e sai do `server.ts`.
 */
@Module({})
export class AppModule {}
