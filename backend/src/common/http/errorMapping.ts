import { Logger } from "@nestjs/common";
import multer from "multer";

import {
  ForbiddenError,
  UnauthorizedError,
} from "../../modules/auth/errors/auth.errors.js";
import { InvalidInputError } from "../../modules/errors/invalidInput.error.js";
import { InvalidMenuError } from "../../modules/errors/invalidMenu.error.js";
import { GeoUnavailableError } from "../../modules/geo/errors/geo.errors.js";
import {
  InvalidPublicCartError,
  RateLimitedError,
} from "../../modules/menulink/errors/menuLink.errors.js";
import {
  InvalidOrderError,
  InvalidTransitionError,
  OrderNotFoundError,
} from "../../modules/order/errors/order.errors.js";
import { InvalidSettingsError } from "../../modules/settings/errors/settings.errors.js";
import { TenantNotFoundError } from "../../modules/tenants/errors/tenant.errors.js";

export interface MappedError {
  status: number;
  body: Record<string, unknown>;
  /** `true` quando ninguém reconheceu o erro: quem responde deve LOGAR o original. */
  unhandled: boolean;
}

/**
 * ÚNICO mapa Error → HTTP do projeto. Puro: o `errorHandler` (Express legado)
 * e o `AllExceptionsFilter` (Nest) só traduzem o resultado para o seu `res`,
 * então os dois não divergem.
 *
 * Os branches de auth NÃO devolvem `message`, ao contrário do 500: a mensagem
 * seria texto pt-BR congelado no serviço (mata o i18n) e, no caso de
 * credencial inválida, contaria qual metade estava errada. O `code` é o
 * contrato — o frontend renderiza `login.errors.<code>`.
 */
export function mapError(error: unknown): MappedError {
  const checkedAt = new Date().toISOString();
  const known = (
    status: number,
    body: Record<string, unknown>,
  ): MappedError => ({
    status,
    body: { ...body, checkedAt },
    unhandled: false,
  });

  if (error instanceof UnauthorizedError) {
    return known(401, { status: "unauthorized", code: error.code });
  }

  if (error instanceof ForbiddenError) {
    return known(403, { status: "forbidden", code: error.code });
  }

  if (error instanceof TenantNotFoundError) {
    return known(404, { status: "not_found", code: "tenant_not_found" });
  }

  if (
    error instanceof InvalidSettingsError ||
    error instanceof InvalidInputError ||
    error instanceof InvalidMenuError ||
    error instanceof InvalidOrderError
  ) {
    return known(422, {
      status: "invalid",
      code: error.code,
      field: error.field,
    });
  }

  // Carrinho da página do cardápio recusado: `problems` diz o que há de errado
  // em cada linha; a página traduz por `publicMenu.errors.<code>`.
  if (error instanceof InvalidPublicCartError) {
    return known(422, {
      status: "invalid",
      code: error.code,
      problems: error.problems,
    });
  }

  if (error instanceof RateLimitedError) {
    return known(429, { status: "rate_limited", code: error.code });
  }

  if (error instanceof OrderNotFoundError) {
    return known(404, { status: "not_found", code: error.code });
  }

  // O pedido existe, mas o status atual não permite (ou outra aba mudou antes).
  if (error instanceof InvalidTransitionError) {
    return known(409, {
      status: "conflict",
      code: error.code,
      from: error.from,
      to: error.to,
    });
  }

  // Provedor externo (OpenStreetMap) falhou — não é culpa da entrada.
  if (error instanceof GeoUnavailableError) {
    return known(502, { status: "unavailable", code: error.code });
  }

  // Arquivo grande demais, campo errado etc. — o multer lança antes do
  // `InvalidMenuError` do fileFilter ter chance de rodar nesses casos.
  if (error instanceof multer.MulterError) {
    return known(422, {
      status: "invalid",
      code: "image_too_large",
      field: "image",
    });
  }

  // Falha desconhecida: o detalhe vai para o log do servidor, nunca para o
  // corpo. `error.message` de um driver carrega host, porta, nome de tabela e
  // de coluna — e a resposta serve também a chamadas anônimas
  // (`/api/auth/login`, `/webhooks/whatsapp`).
  return {
    status: 500,
    body: {
      status: "error",
      code: "internal_error",
      message: "Erro interno. Tente novamente em instantes.",
      checkedAt,
    },
    unhandled: true,
  };
}

const logger = new Logger("ExceptionFilter");

export function logUnhandledError(error: unknown): void {
  logger.error(
    `Unhandled error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
}
