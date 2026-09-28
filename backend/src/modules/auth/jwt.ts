import jwt from "jsonwebtoken";

import { env } from "../../config/env.js";

import type { AuthTokenPayload } from "./auth.types.js";

/**
 * Algoritmo único aceito. A allowlist no `verify` é o que mata a família de
 * ataques de confusão de algoritmo (`alg: none`, HS256 assinado com a chave
 * pública RS256): sem ela, `jsonwebtoken` obedeceria o header do token, que é
 * escrito por quem envia.
 */
const ALGORITHM = "HS256" as const;

export type VerifyFailureCode = "invalid_token" | "expired_token";

export type VerifyResult =
  | { ok: true; payload: AuthTokenPayload }
  | { ok: false; code: VerifyFailureCode };

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(
    { userId: payload.userId, tenantId: payload.tenantId },
    env.jwtSecret,
    {
      algorithm: ALGORITHM,
      expiresIn: env.jwtExpiresInSeconds,
    },
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Verifica e decodifica. NUNCA lança — devolve união discriminada, seguindo a
 * convenção "guardrails retornam, não lançam" (`error-handling.md`). Quem
 * chama (o middleware) decide qual erro tipado emitir.
 */
export function verifyAuthToken(token: string): VerifyResult {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });
  } catch (error) {
    const expired =
      error instanceof Error && error.name === "TokenExpiredError";
    return { ok: false, code: expired ? "expired_token" : "invalid_token" };
  }

  if (typeof decoded !== "object" || decoded === null) {
    return { ok: false, code: "invalid_token" };
  }

  const { userId, tenantId, exp } = decoded as Record<string, unknown>;

  // `exp` é obrigatório: um token sem expiração é um token eterno, e a
  // ausência do campo faria o `verify` passar sem checar nada.
  if (!isPositiveInteger(exp)) {
    return { ok: false, code: "invalid_token" };
  }
  if (!isPositiveInteger(userId) || !isPositiveInteger(tenantId)) {
    return { ok: false, code: "invalid_token" };
  }

  return { ok: true, payload: { userId, tenantId } };
}
