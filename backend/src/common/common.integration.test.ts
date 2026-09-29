import "reflect-metadata";
import { createHmac } from "node:crypto";

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Post,
  UseGuards,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { env } from "../config/env.js";
import { OrderNotFoundError } from "../modules/order/errors/order.errors.js";
import { signAuthToken } from "../modules/auth/utils/jwt.js";
import { WebhookSignatureGuard } from "../modules/whatsapp/guards/webhookSignature.guard.js";
import {
  Auth,
  Public,
  RateLimit,
  Tenant,
} from "./decorators/auth.decorators.js";
import { CommonModule } from "./common.module.js";
import { RateLimitGuard } from "./guards/rateLimit.guard.js";

import type { NestExpressApplication } from "@nestjs/platform-express";
import type { RequestAuth } from "../modules/auth/types/auth.types.js";
import type { TenantId } from "../modules/tenants/types/tenant.types.js";

const seen = vi.fn();

@Controller("probe")
class ProbeController {
  @Get("me")
  me(@Auth() auth: RequestAuth, @Tenant() tenantId: TenantId) {
    return { auth, tenantId };
  }

  @Public()
  @Get("open")
  open() {
    return { open: true };
  }

  // Pública que (erroneamente) pede o tenant: tem de dar 401, não 500.
  @Public()
  @Get("open-tenant")
  openTenant(@Tenant() tenantId: TenantId) {
    return { tenantId };
  }

  @Get("missing")
  missing() {
    throw new OrderNotFoundError();
  }

  @Get("boom")
  boom() {
    throw new Error('connect ECONNREFUSED 10.0.0.5:5432 relation "orders"');
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 2 })
  @Get("limited")
  limited() {
    return { ok: true };
  }

  @Public()
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(200)
  @Post("webhook")
  webhook(@Body() body: unknown) {
    seen(body);
    return { ok: true };
  }
}

@Module({ imports: [CommonModule], controllers: [ProbeController] })
class ProbeModule {}

describe("common (Nest nativo, sem o Express legado)", () => {
  let app: NestExpressApplication;
  const original = env.whatsapp.appSecret;

  beforeAll(async () => {
    env.whatsapp.appSecret = "integration-secret";
    app = await NestFactory.create<NestExpressApplication>(ProbeModule, {
      logger: false,
      rawBody: true,
    });
    await app.init();
  });

  afterAll(async () => {
    env.whatsapp.appSecret = original;
    await app.close();
  });

  const http = () => app.getHttpServer();
  const bearer = () => `Bearer ${signAuthToken({ userId: 9, tenantId: 5 })}`;

  it("guard global: 401 missing_token sem Authorization", async () => {
    const res = await request(http()).get("/probe/me");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: "unauthorized",
      code: "missing_token",
    });
    expect(res.body).not.toHaveProperty("message");
  });

  it("guard global: 401 invalid_token com token ruim", async () => {
    const res = await request(http())
      .get("/probe/me")
      .set("Authorization", "Bearer x");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_token");
  });

  it("@Auth() e @Tenant() entregam o contexto do token", async () => {
    const res = await request(http())
      .get("/probe/me")
      .set("Authorization", bearer());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ auth: { userId: 9, tenantId: 5 }, tenantId: 5 });
  });

  it("@Public() abre a rota sem token", async () => {
    const res = await request(http()).get("/probe/open");

    expect(res.status).toBe(200);
  });

  it("@Public() que pede @Tenant() degrada para 401, não 500", async () => {
    const res = await request(http()).get("/probe/open-tenant");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("missing_token");
  });

  it("filter: erro de domínio vira status + code do projeto", async () => {
    const res = await request(http())
      .get("/probe/missing")
      .set("Authorization", bearer());

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: "not_found",
      code: "order_not_found",
    });
  });

  it("filter: erro desconhecido vira 500 sem vazar host/tabela", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(http())
      .get("/probe/boom")
      .set("Authorization", bearer());

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("internal_error");
    expect(JSON.stringify(res.body)).not.toMatch(/10\.0\.0\.5|orders/);
    logged.mockRestore();
  });

  it("filter: rota inexistente é 404 no formato do projeto", async () => {
    const res = await request(http()).get("/nao-existe");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: "not_found",
      code: "route_not_found",
    });
  });

  it("RateLimitGuard: 429 rate_limited depois do limite", async () => {
    await request(http()).get("/probe/limited").expect(200);
    await request(http()).get("/probe/limited").expect(200);
    const res = await request(http()).get("/probe/limited");

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      status: "rate_limited",
      code: "rate_limited",
    });
  });

  describe("rawBody nativo do Nest + WebhookSignatureGuard", () => {
    // Espaços duplos e unicode: JSON.stringify(JSON.parse(x)) NÃO reproduz estes bytes.
    const body = '{"object":"whatsapp_business_account",  "text":"olá  mundo"}';
    const sign = (payload: string) =>
      `sha256=${createHmac("sha256", "integration-secret").update(payload).digest("hex")}`;

    it("aceita assinatura sobre os bytes originais", async () => {
      seen.mockClear();

      const res = await request(http())
        .post("/probe/webhook")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", sign(body))
        .send(body);

      expect(res.status).toBe(200);
      expect(seen).toHaveBeenCalledWith({
        object: "whatsapp_business_account",
        text: "olá  mundo",
      });
    });

    it("recusa (403) assinatura calculada sobre o JSON re-serializado", async () => {
      seen.mockClear();
      const reserialized = JSON.stringify(JSON.parse(body));
      expect(reserialized).not.toBe(body);

      const res = await request(http())
        .post("/probe/webhook")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", sign(reserialized))
        .send(body);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("invalid_signature");
      expect(seen).not.toHaveBeenCalled();
    });

    it("recusa (403) sem cabeçalho de assinatura", async () => {
      const res = await request(http())
        .post("/probe/webhook")
        .set("Content-Type", "application/json")
        .send(body);

      expect(res.status).toBe(403);
    });
  });
});
