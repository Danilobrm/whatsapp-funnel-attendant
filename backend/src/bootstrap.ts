import "reflect-metadata";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { createServer } from "./api/server.js";

import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Type } from "@nestjs/common";
import type { RequestListener } from "node:http";

/**
 * Sobe o Nest com o Express legado montado ANTES das rotas do Nest.
 *
 * Ordem importa: `app.use(legacy)` acontece antes de `init()`, que é quando o
 * Nest registra suas rotas. Uma requisição entra no legado; se nenhuma rota
 * dele casa, o Express segue adiante e chega no Nest (que responde 404 se
 * também não tiver a rota). O legado já leu o corpo (`req._body`), então o
 * body-parser do Nest o ignora — e o `rawBody` do webhook segue vindo do
 * `verify` do legado até o módulo `whatsapp` ser portado.
 *
 * `root` e `legacy` existem para o teste registrar um módulo e um legado
 * próprios; produção usa o `AppModule` e o `createServer()`.
 */
export async function createApp(
  root: Type<unknown> = AppModule,
  legacy: RequestListener = createServer(),
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(root, {
    logger: ["error", "warn"],
    rawBody: true,
  });
  app.use(legacy);
  return app;
}
