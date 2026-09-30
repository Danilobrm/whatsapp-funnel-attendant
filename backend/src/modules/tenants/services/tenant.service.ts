import { Injectable } from "@nestjs/common";

import { TenantNotFoundError } from "../errors/tenant.errors.js";
import { TenantRepository } from "../repositories/tenant.repository.js";

import type { Tenant } from "../types/tenant.types.js";

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

@Injectable()
export class TenantService {
  /**
   * Cache SÓ POSITIVO. A chave vem do corpo do webhook: cachear miss deixaria
   * quem forja requisições crescer o Map sem limite. Cacheando só acerto, o
   * tamanho fica preso ao número real de tenants. Campo da instância: cada
   * teste cria a sua, sem estado vazando entre eles.
   */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly tenants: TenantRepository) {}

  /** Descarta o cache. Sem argumento limpa tudo. */
  invalidateTenantCache(phoneNumberId?: string): void {
    if (phoneNumberId === undefined) {
      this.cache.clear();
    } else {
      this.cache.delete(phoneNumberId);
    }
  }

  async resolveTenantByWhatsAppPhoneNumberId(
    phoneNumberId: string | null | undefined,
  ): Promise<Tenant> {
    const normalized =
      typeof phoneNumberId === "string" ? phoneNumberId.trim() : "";

    if (!PHONE_NUMBER_ID_PATTERN.test(normalized)) {
      throw new TenantNotFoundError(phoneNumberId ?? null);
    }

    const now = Date.now();
    const hit = this.cache.get(normalized);
    if (hit !== undefined && hit.expiresAt > now) {
      return hit.value;
    }
    if (hit !== undefined) {
      this.cache.delete(normalized);
    }

    const tenant =
      await this.tenants.findTenantByWhatsAppPhoneNumberId(normalized);
    if (tenant === null) {
      throw new TenantNotFoundError(normalized);
    }

    this.cache.set(normalized, {
      value: tenant,
      expiresAt: now + TENANT_CACHE_TTL_MS,
    });
    return tenant;
  }
}
