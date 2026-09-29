import { Router } from "express";

import {
  receiveWebhook,
  verifyWebhook,
} from "../controllers/whatsappController.js";

/**
 * Público por natureza — quem chama é a Meta, que não tem JWT. A autenticação
 * é o `hub.verify_token` (GET) e a assinatura HMAC do corpo (POST).
 */
export const whatsappRoutes = Router();

whatsappRoutes.get("/", verifyWebhook);
whatsappRoutes.post("/", receiveWebhook);
