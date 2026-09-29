import { UnauthorizedError } from "../../../modules/auth/errors/auth.errors.js";
import { readBearerAuth } from "../../../modules/auth/utils/bearer.js";

import type { RequestHandler } from "express";

/**
 * Exige um token válido. Síncrono de propósito — não sendo `async`, não há
 * promise para o Express 4 deixar cair, então dispensa `asyncHandler`.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const result = readBearerAuth(req.headers.authorization);

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
