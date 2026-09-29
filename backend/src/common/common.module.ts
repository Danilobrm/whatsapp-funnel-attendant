import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";

import { AllExceptionsFilter } from "./filters/allExceptions.filter.js";
import { AuthGuard } from "./guards/auth.guard.js";

/**
 * Peças transversais registradas globalmente: o mapa de erros e o guard de
 * autenticação (fechado por padrão, aberto com `@Public()`). Todo módulo
 * raiz — `AppModule` e os de teste — importa este.
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class CommonModule {}
