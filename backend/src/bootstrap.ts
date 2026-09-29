import "reflect-metadata";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { env } from "./config/env.js";
import { productImagesDir } from "./modules/menu/storage/imageStorage.js";

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

  app.enableCors({ origin: env.corsOrigin });
  app.useStaticAssets(productImagesDir(), { prefix: "/produtos" });

  return app;
}
