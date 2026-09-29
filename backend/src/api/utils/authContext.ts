import { UnauthorizedError } from "../../modules/auth/errors/auth.errors.js";

import type { RequestAuth } from "../../modules/auth/types/auth.types.js";
import type { TenantId } from "../../modules/tenants/types/tenant.types.js";
import type { Request } from "express";

/**
 * Lê o contexto autenticado da requisição.
 *
 * Existe para ser o ÚNICO lugar onde a ausência de `req.auth` é tratada. Um
 * `req.auth!` espalhado pelos controllers transformaria uma rota mal montada
 * (sem `requireAuth`) num TypeError → 500; aqui ela degrada para um 401 limpo,
 * que é a verdade: aquela requisição não estava autenticada.
 */
export function authOf(req: Request): RequestAuth {
  if (!req.auth) {
    throw new UnauthorizedError("missing_token");
  }
  return req.auth;
}

export function tenantOf(req: Request): TenantId {
  return authOf(req).tenantId;
}
