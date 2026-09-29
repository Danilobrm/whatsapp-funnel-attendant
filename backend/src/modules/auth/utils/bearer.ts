import { UnauthorizedError } from "../errors/auth.errors.js";
import { asTenantId } from "../../tenants/types/tenant.types.js";
import { verifyAuthToken } from "./jwt.js";

import type { RequestAuth } from "../types/auth.types.js";

const BEARER = "Bearer ";

export type BearerResult =
  | { kind: "absent" }
  | { kind: "ok"; auth: RequestAuth }
  | { kind: "error"; error: UnauthorizedError };

/**
 * Lê o cabeçalho `Authorization`. Puro e sem lançar: o middleware do Express
 * legado e o `AuthGuard` do Nest decidem como propagar o erro.
 */
export function readBearerAuth(header: unknown): BearerResult {
  if (typeof header !== "string" || !header.startsWith(BEARER)) {
    return { kind: "absent" };
  }

  const result = verifyAuthToken(header.slice(BEARER.length).trim());
  if (!result.ok) {
    return { kind: "error", error: new UnauthorizedError(result.code) };
  }

  return {
    kind: "ok",
    auth: {
      userId: result.payload.userId,
      tenantId: asTenantId(result.payload.tenantId),
    },
  };
}
