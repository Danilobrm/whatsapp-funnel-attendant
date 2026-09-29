import { UnauthorizedError } from "../../../modules/auth/errors/auth.errors.js";
import { verifyAuthToken } from "../../../modules/auth/utils/jwt.js";
import { asTenantId } from "../../../modules/tenants/types/tenant.types.js";

import type { RequestAuth } from "../../../modules/auth/types/auth.types.js";
import type { RequestHandler } from "express";

const BEARER = "Bearer ";

type ReadResult =
  | { kind: "absent" }
  | { kind: "ok"; auth: RequestAuth }
  | { kind: "error"; error: UnauthorizedError };

function readAuth(header: unknown): ReadResult {
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

/**
 * Exige um token válido. Síncrono de propósito — não sendo `async`, não há
 * promise para o Express 4 deixar cair, então dispensa `asyncHandler`.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const result = readAuth(req.headers.authorization);

  if (result.kind === "absent") {
    next(new UnauthorizedError("missing_token"));
    return;
  }
  if (result.kind === "error") {
    next(result.error);
    return;
  }

  req.auth = result.auth;
  next();
};
