import type { RequestAuth } from "../modules/auth/types/auth.types.js";

declare global {
  namespace Express {
    interface Request {
      /**
       * Preenchido por `requireAuth` / `optionalAuth`. OPCIONAL de propósito:
       * rotas públicas (`/health`, `/webhooks/*`) chegam sem ele.
       * Leia sempre via `tenantOf(req)` / `authOf(req)` — nunca com `req.auth!`.
       */
      auth?: RequestAuth;
      /**
       * Corpo cru, preenchido só nas rotas `/webhooks/*` (ver `server.ts`).
       * É sobre estes bytes que a Meta calcula o X-Hub-Signature-256.
       */
      rawBody?: Buffer;
    }
  }
}

export {};
