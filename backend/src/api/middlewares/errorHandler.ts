import type { ErrorRequestHandler } from "express";

import {
  ForbiddenError,
  UnauthorizedError,
} from "../../modules/auth/auth.errors.js";
import { InvalidInputError } from "../../modules/errors/invalidInput.error.js";
import { InvalidMenuError } from "../../modules/errors/invalidMenu.error.js";
import { InvalidSettingsError } from "../../modules/settings/settings.service.js";
import { TenantNotFoundError } from "../../modules/tenants/tenant.service.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // Os três branches de auth NÃO devolvem `message`, ao contrário do 500 lá
  // embaixo: a mensagem seria texto pt-BR congelado no serviço (mata o i18n) e,
  // no caso de credencial inválida, contaria qual metade estava errada.
  // O `code` é o contrato — o frontend renderiza `login.errors.<code>`.
  if (error instanceof UnauthorizedError) {
    res.status(401).json({
      status: "unauthorized",
      code: error.code,
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  if (error instanceof ForbiddenError) {
    res.status(403).json({
      status: "forbidden",
      code: error.code,
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  if (error instanceof TenantNotFoundError) {
    res.status(404).json({
      status: "not_found",
      code: "tenant_not_found",
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  if (error instanceof InvalidSettingsError) {
    res.status(422).json({
      status: "invalid",
      code: error.code,
      field: error.field,
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  if (error instanceof InvalidInputError) {
    res.status(422).json({
      status: "invalid",
      code: error.code,
      field: error.field,
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  if (error instanceof InvalidMenuError) {
    res.status(422).json({
      status: "invalid",
      code: error.code,
      field: error.field,
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  // Falha desconhecida: o detalhe vai para o log do servidor, nunca para o
  // corpo. `error.message` de um driver carrega host, porta, nome de tabela e
  // de coluna — e este handler responde também a chamadas anônimas
  // (`/api/auth/login`, `/webhooks/whatsapp`).
  console.error(
    "Unhandled error:",
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  res.status(500).json({
    status: "error",
    code: "internal_error",
    message: safeMessage(),
    checkedAt: new Date().toISOString(),
  });
};

/** Texto genérico e estável — o detalhe fica no log, não na resposta. */
function safeMessage(): string {
  return "Erro interno. Tente novamente em instantes.";
}
