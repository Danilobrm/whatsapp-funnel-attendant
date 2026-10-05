import { SetMetadata, createParamDecorator } from "@nestjs/common";

import { UnauthorizedError } from "../../modules/auth/errors/auth.errors.js";

import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import type { RequestAuth } from "../../modules/auth/types/auth.types.js";
import type { TenantId } from "../../modules/tenants/types/tenant.types.js";

export const IS_PUBLIC_KEY = "attendant:isPublic";
export const RATE_LIMIT_KEY = "attendant:rateLimit";

/**
 * Abre uma rota (ou controller) do guard global. O padrão é FECHADO: quem
 * esquece de marcar fica protegido, ao contrário de um `requireAuth`
 * esquecido no mount.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/** Limite por IP do `RateLimitGuard`, por handler (cada um tem o seu balde). */
export const RateLimit = (
  options: RateLimitOptions,
): MethodDecorator & ClassDecorator => SetMetadata(RATE_LIMIT_KEY, options);

function authFrom(ctx: ExecutionContext): RequestAuth {
  const req = ctx.switchToHttp().getRequest<Request>();
  // Único lugar onde a ausência de `req.auth` é tratada: uma rota `@Public()`
  // que pede `@Tenant()` degrada para 401 limpo, não para TypeError → 500.
  if (!req.auth) throw new UnauthorizedError("missing_token");
  return req.auth;
}

/** `{ userId, tenantId }` do token — o `authOf(req)` do Nest. */
export const Auth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestAuth => authFrom(ctx),
);

/** O `TenantId` (branded) do token — o `tenantOf(req)` do Nest. Nunca do body. */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantId => authFrom(ctx).tenantId,
);
