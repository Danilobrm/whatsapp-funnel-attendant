import { Injectable } from "@nestjs/common";

import { env } from "../../../config/env.js";
import { ForbiddenError } from "../../auth/errors/auth.errors.js";
import { isValidSignature } from "../utils/whatsapp.signature.js";

import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/**
 * Autentica o POST do webhook da Meta pela assinatura HMAC dos bytes CRUS
 * (`req.rawBody`). Falha fechada: sem secret, sem corpo cru ou sem cabeçalho →
 * `ForbiddenError("invalid_signature")` → 403.
 *
 * O `rawBody` vem do Nest (`rawBody: true` no `create`) ou, enquanto o
 * Express legado ainda lê o corpo primeiro, do `verify` do `express.json` dele
 * — os dois preenchem a mesma propriedade.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const signature = req.get("x-hub-signature-256");

    if (!isValidSignature(req.rawBody, signature, env.whatsapp.appSecret)) {
      throw new ForbiddenError("invalid_signature");
    }
    return true;
  }
}
