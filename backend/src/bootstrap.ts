import "reflect-metadata";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { env } from "./config/env.js";
import { ProductImageStorage } from "./modules/menu/storage/imageStorage.js";

import type { Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";

/**
 * Monta o app Nest completo. `root` existe para o teste registrar um módulo
 * próprio; produção usa o `AppModule`.
 *
 * - `rawBody: true`: a assinatura do webhook da Meta é sobre os BYTES originais
 *   do corpo; o JSON parseado não os reproduz (`WebhookSignatureGuard` lê
 *   `req.rawBody`).
 * - CORS não precisa de ajuste para o Bearer: com apenas `origin` definido, o
 *   pacote `cors` reflete o `Access-Control-Request-Headers` do preflight.
 * - Fotos de produto: públicas (o painel usa a URL direto em `<img>`), como
 *   seria um bucket S3 público. Só o UPLOAD (`POST /api/menu/images`) exige
 *   login — servir o arquivo depois de gravado não precisa.
 */
export async function createApp(
  root: Type<unknown> = AppModule,
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(root, {
    logger: ["error", "warn"],
    rawBody: true,
  });

  configureApp(app);
  return app;
}

/**
 * Configuração HTTP do app (CORS, shutdown hooks, fotos estáticas), separada
 * do `create` para o teste do app inteiro montar o módulo com `overrideProvider`
 * e aplicar a MESMA configuração.
 */
export function configureApp(app: NestExpressApplication): void {
  app.enableCors({ origin: env.corsOrigin });
  // Fecha o pool e o resto no SIGTERM (`docker stop`) em vez de cortar a conexão.
  app.enableShutdownHooks();
  app.useStaticAssets(app.get(ProductImageStorage).productImagesDir(), {
    prefix: "/produtos",
  });
}
