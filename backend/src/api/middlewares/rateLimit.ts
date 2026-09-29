import { RateLimitedError } from "../../modules/menulink/errors/menuLink.errors.js";

import type { RequestHandler } from "express";

interface Options {
  windowMs: number;
  max: number;
  /** Relógio injetável para teste. */
  now?: () => number;
}

/**
 * Limitador em memória, janela deslizante por IP. Guarda as rotas PÚBLICAS
 * (cardápio em link), que qualquer um na internet pode chamar. Instância
 * única, como o barramento de pedidos: com várias instâncias o limite vale
 * por instância — trocar por Redis atrás da mesma assinatura.
 */
export function createRateLimiter({
  windowMs,
  max,
  now = Date.now,
}: Options): RequestHandler {
  const hits = new Map<string, number[]>();
  let lastSweep = now();

  return (req, _res, next) => {
    const t = now();

    // Varre chaves velhas de vez em quando: sem isto o Map só cresce.
    if (t - lastSweep > windowMs) {
      for (const [key, times] of hits) {
        if (times.every((h) => t - h >= windowMs)) hits.delete(key);
      }
      lastSweep = t;
    }

    const key = req.ip ?? "unknown";
    const recent = (hits.get(key) ?? []).filter((h) => t - h < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      next(new RateLimitedError());
      return;
    }
    recent.push(t);
    hits.set(key, recent);
    next();
  };
}
