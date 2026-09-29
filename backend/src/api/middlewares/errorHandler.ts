import { logUnhandledError, mapError } from "../../common/http/errorMapping.js";

import type { ErrorRequestHandler } from "express";

/**
 * Adaptador do Express legado para o mapa único em `common/http/errorMapping`.
 * Sai junto com o `server.ts` na Etapa 3.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const mapped = mapError(error);
  if (mapped.unhandled) logUnhandledError(error);
  res.status(mapped.status).json(mapped.body);
};
