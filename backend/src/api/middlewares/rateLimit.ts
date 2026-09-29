import { SlidingWindowLimiter } from "../../common/rate-limit/slidingWindow.js";
import { RateLimitedError } from "../../modules/menulink/errors/menuLink.errors.js";

import type { SlidingWindowOptions } from "../../common/rate-limit/slidingWindow.js";
import type { RequestHandler } from "express";

/**
 * Adaptador do Express legado para `SlidingWindowLimiter`. Guarda as rotas
 * PÚBLICAS (cardápio em link), que qualquer um na internet pode chamar. Sai
 * com o `server.ts` na Etapa 3; o Nest usa o `RateLimitGuard`.
 */
export function createRateLimiter(
  options: SlidingWindowOptions,
): RequestHandler {
  const limiter = new SlidingWindowLimiter(options);

  return (req, _res, next) => {
    if (!limiter.allow(req.ip ?? "unknown")) {
      next(new RateLimitedError());
      return;
    }
    next();
  };
}
