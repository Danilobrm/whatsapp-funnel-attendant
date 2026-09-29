import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";

import { Public } from "../../../common/decorators/auth.decorators.js";
import { env } from "../../../config/env.js";
import { ForbiddenError } from "../../auth/errors/auth.errors.js";
import { WebhookSignatureGuard } from "../guards/webhookSignature.guard.js";
import { processWebhook } from "../services/whatsapp.service.js";

import type { Response } from "express";

/**
 * Público por natureza — quem chama é a Meta, que não tem JWT. A autenticação
 * é o `hub.verify_token` (GET) e a assinatura HMAC do corpo (POST).
 */
@Public()
@Controller("webhooks/whatsapp")
export class WhatsAppController {
  /**
   * Handshake de registro do webhook no painel da Meta:
   * `GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` → devolve o
   * challenge em texto puro quando o token confere.
   */
  @Get()
  verify(
    @Query("hub.mode") mode: unknown,
    @Query("hub.verify_token") token: unknown,
    @Query("hub.challenge") challenge: unknown,
    @Res({ passthrough: true }) res: Response,
  ): string {
    const expected = env.whatsapp.verifyToken;

    if (
      mode !== "subscribe" ||
      !expected ||
      token !== expected ||
      typeof challenge !== "string"
    ) {
      throw new ForbiddenError("invalid_verify_token");
    }

    // O tipo só é definido no sucesso: um `@Header` faria o JSON de erro do
    // filter (403) sair como `text/plain`.
    res.type("text/plain");
    return challenge;
  }

  /**
   * Recebe mensagens. Responde 200 ANTES de processar: a Meta espera resposta
   * rápida e reenvia o webhook quando não recebe — o processamento (LLM
   * incluído) leva segundos. O reenvio que escapar é neutralizado pela
   * deduplicação por `external_id` em `handleInboundMessage`.
   *
   * A assinatura HMAC é conferida pelo `WebhookSignatureGuard`, sobre os bytes
   * crus. Processar depois da resposta assume um servidor Node de longa
   * duração. Em serverless o trabalho seria cortado — ali entra uma fila.
   */
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(200)
  @Post()
  receive(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): string {
    void processWebhook(body).catch((err: unknown) => {
      console.error(
        "[whatsapp] falha inesperada no processamento do webhook:",
        err instanceof Error ? err.message : String(err),
      );
    });

    res.type("text/plain");
    return "OK";
  }
}
