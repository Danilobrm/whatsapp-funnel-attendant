import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { CommonModule } from "../common/common.module.js";
import { signAuthToken } from "../modules/auth/utils/jwt.js";

import type { Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";

/**
 * App Nest mínimo para testar um controller pelo HTTP de verdade (guard global,
 * filter e pipes incluídos) com os services mockados via `vi.mock`. Feche com
 * `app.close()` no `afterAll`.
 */
export async function createTestApp(
  ...modules: Type<unknown>[]
): Promise<NestExpressApplication> {
  @Module({ imports: [CommonModule, ...modules] })
  class TestRootModule {}

  const app = await NestFactory.create<NestExpressApplication>(TestRootModule, {
    logger: false,
    rawBody: true,
  });
  await app.init();
  return app;
}

export function bearer(userId = 1, tenantId = 1): string {
  return `Bearer ${signAuthToken({ userId, tenantId })}`;
}
