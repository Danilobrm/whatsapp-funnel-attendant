import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { CommonModule } from "../common/common.module.js";
import { signAuthToken } from "../modules/auth/utils/jwt.js";

import type { Provider, Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";

export function bearer(userId = 1, tenantId = 1): string {
  return `Bearer ${signAuthToken({ userId, tenantId })}`;
}

/**
 * Controller sob teste + os colaboradores que ele injeta, trocados por
 * `useValue` (mocks). Guard global e filter reais; nada de banco. Feche com
 * `app.close()` no `afterAll`.
 */
export async function createControllerTestApp(options: {
  controllers: Type<unknown>[];
  providers?: Provider[];
}): Promise<NestExpressApplication> {
  @Module({
    imports: [CommonModule],
    controllers: options.controllers,
    providers: options.providers ?? [],
  })
  class ControllerTestModule {}

  const app = await NestFactory.create<NestExpressApplication>(
    ControllerTestModule,
    { logger: false, rawBody: true },
  );
  await app.init();
  return app;
}
