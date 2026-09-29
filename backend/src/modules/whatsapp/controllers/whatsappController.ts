import { env } from "../../../config/env.js";
import { ForbiddenError } from "../../auth/errors/auth.errors.js";
import { isValidSignature } from "../utils/whatsapp.signature.js";
import { processWebhook } from "../services/whatsapp.service.js";

import type { RequestHandler } from "express";

/**
 * Handshake de registro do webhook no painel da Meta:
 * `GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` → devolve o
 * challenge em texto puro quando o token confere.
 *
 * Síncrono — sem promise para o Express 4 deixar cair, dispensa asyncHandler.
 */
export const verifyWebhook: RequestHandler = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expected = env.whatsapp.verifyToken;

  if (
    mode !== "subscribe" ||
    !expected ||
    token !== expected ||
    typeof challenge !== "string"
  ) {
    throw new ForbiddenError("invalid_verify_token");
  }

  res.status(200).type("text/plain").send(challenge);
};

/**
 * Recebe mensagens. Responde 200 ANTES de processar: a Meta espera resposta
 * rápida e reenvia o webhook quando não recebe — o processamento (LLM
 * incluído) leva segundos. O reenvio que escapar é neutralizado pela
 * deduplicação por `external_id` em `handleInboundMessage`.
 *
 * Processar depois da resposta assume um servidor Node de longa duração. Em
 * serverless o trabalho seria cortado — ali entra uma fila.
 */
export const receiveWebhook: RequestHandler = (req, res) => {
  const signature = req.get("x-hub-signature-256");
  if (!isValidSignature(req.rawBody, signature, env.whatsapp.appSecret)) {
    throw new ForbiddenError("invalid_signature");
  }

  res.sendStatus(200);

  processWebhook(req.body).catch((err: unknown) => {
    console.error(
      "[whatsapp] falha inesperada no processamento do webhook:",
      err instanceof Error ? err.message : String(err),
    );
  });
};
