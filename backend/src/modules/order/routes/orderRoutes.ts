import { Router } from "express";

import { env } from "../../../config/env.js";
import {
  getOrderById,
  getOrders,
  getOrderStream,
  postDevSample,
  postTransition,
} from "../controllers/orderController.js";

// Guardado no mount, em `server.ts`.
export function createOrderRoutes(): Router {
  const router = Router();

  router.get("/", getOrders);
  // Antes de `/:id`, senão "stream" seria lido como id.
  router.get("/stream", getOrderStream);
  // Pedido de teste: a rota nem existe em produção (404, não 403).
  if (env.nodeEnv !== "production") {
    router.post("/dev-sample", postDevSample);
  }
  router.get("/:id", getOrderById);
  router.post("/:id/transition", postTransition);

  return router;
}
