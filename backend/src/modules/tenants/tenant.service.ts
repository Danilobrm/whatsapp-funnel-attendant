import { findTenantByWhatsAppPhoneNumberId } from "./tenant.repository.js";

import type { Tenant } from "./tenant.types.js";

/**
 * Nenhum tenant para o identificador recebido. Mapeado para 404 no
 * `errorHandler` quando chega a uma rota HTTP; no webhook é só logado, porque
 * a Meta não tem o que fazer com um 404.
 */
export class TenantNotFoundError extends Error {
  readonly key: string | null;

  constructor(key: string | null) {
    super(`Tenant não encontrado: ${key ?? "(vazio)"}`);
    this.name = "TenantNotFoundError";
    this.key = key;
  }
}

/** `phone_number_id` da Meta é numérico. Rejeitado antes de tocar no banco. */
const PHONE_NUMBER_ID_PATTERN = /^\d{5,30}$/;

/**
 * Todo webhook resolve o tenant, e a Meta manda um POST por mensagem, status
 * de entrega e leitura. Sem cache, cada um custa um SELECT.
 */
const TENANT_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: Tenant;
  expiresAt: number;
}

/**
 * Cache SÓ POSITIVO. A chave vem do corpo do webhook: cachear miss deixaria
 * quem forja requisições crescer o Map sem limite. Cacheando só acerto, o
 * tamanho fica preso ao número real de tenants.
 */
const cache = new Map<string, CacheEntry>();

/** Descarta o cache. Sem argumento limpa tudo; usado pelos testes. */
export function invalidateTenantCache(phoneNumberId?: string): void {
  if (phoneNumberId === undefined) {
    cache.clear();
  } else {
    cache.delete(phoneNumberId);
  }
}

export async function resolveTenantByWhatsAppPhoneNumberId(
  phoneNumberId: string | null | undefined,
): Promise<Tenant> {
  const normalized =
    typeof phoneNumberId === "string" ? phoneNumberId.trim() : "";

  if (!PHONE_NUMBER_ID_PATTERN.test(normalized)) {
    throw new TenantNotFoundError(phoneNumberId ?? null);
  }

  const now = Date.now();
  const hit = cache.get(normalized);
  if (hit !== undefined && hit.expiresAt > now) {
    return hit.value;
  }
  if (hit !== undefined) {
    cache.delete(normalized);
  }

  const tenant = await findTenantByWhatsAppPhoneNumberId(normalized);
  if (tenant === null) {
    throw new TenantNotFoundError(normalized);
  }

  cache.set(normalized, {
    value: tenant,
    expiresAt: now + TENANT_CACHE_TTL_MS,
  });
  return tenant;
}
