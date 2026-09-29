import { Router } from "express";

import {
  getPublicMenu,
  postPublicCart,
} from "../controllers/publicMenuController.js";
import { createRateLimiter } from "../../../api/middlewares/rateLimit.js";

/**
 * Superfície pública do cardápio em link, autenticada pelo CÓDIGO da URL. O
 * limite por IP existe porque aqui qualquer um na internet pode bater.
 */
export function createPublicRoutes(): Router {
  const router = Router();
  router.get(
    "/menu/:code",
    createRateLimiter({ windowMs: 60_000, max: 60 }),
    getPublicMenu,
  );
  router.post(
    "/cart/:code",
    createRateLimiter({ windowMs: 60_000, max: 20 }),
    postPublicCart,
  );
  return router;
}
