import { Injectable } from "@nestjs/common";

import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import { StoreRepository } from "../repositories/store.repository.js";
import {
  DEFAULT_STORE_SETTINGS,
  parseStoreSettings,
  parseZoneInput,
} from "../utils/store.parse.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { DeliveryZone, StoreSettings } from "../types/store.types.js";

/**
 * Cache por tenant, mesmo padrão de `SettingsService`: TTL curto, invalidado na
 * escrita, expiração preguiçosa na leitura (sem `setInterval` — travaria o
 * teardown do vitest).
 */
const STORE_CACHE_TTL_MS = 30_000;

interface StoreCacheEntry {
  value: StoreSettings;
  expiresAt: number;
}

@Injectable()
export class StoreService {
  private readonly cache = new Map<TenantId, StoreCacheEntry>();

  constructor(private readonly store: StoreRepository) {}

  invalidateStoreSettingsCache(tenantId?: TenantId): void {
    if (tenantId === undefined) {
      this.cache.clear();
    } else {
      this.cache.delete(tenantId);
    }
  }

  async getStoreSettings(tenantId: TenantId): Promise<StoreSettings> {
    const now = Date.now();
    const hit = this.cache.get(tenantId);
    if (hit !== undefined && hit.expiresAt > now) {
      return hit.value;
    }
    if (hit !== undefined) {
      this.cache.delete(tenantId);
    }

    const stored = await this.store.findStoreSettings(tenantId);
    const value = stored ?? { ...DEFAULT_STORE_SETTINGS };
    this.cache.set(tenantId, { value, expiresAt: now + STORE_CACHE_TTL_MS });
    return value;
  }

  async updateStoreSettings(
    tenantId: TenantId,
    input: unknown,
  ): Promise<StoreSettings> {
    const saved = await this.store.saveStoreSettings(
      tenantId,
      parseStoreSettings(input),
    );
    this.cache.set(tenantId, {
      value: saved,
      expiresAt: Date.now() + STORE_CACHE_TTL_MS,
    });
    return saved;
  }

  listZones(tenantId: TenantId): Promise<DeliveryZone[]> {
    return this.store.listDeliveryZones(tenantId);
  }

  // `async`: entrada inválida chega como REJEIÇÃO, não como exceção síncrona.
  async createZone(tenantId: TenantId, input: unknown): Promise<DeliveryZone> {
    return this.store.createDeliveryZone(tenantId, parseZoneInput(input));
  }

  async updateZone(
    tenantId: TenantId,
    id: number,
    input: unknown,
  ): Promise<DeliveryZone> {
    const zone = await this.store.updateDeliveryZone(
      tenantId,
      id,
      parseZoneInput(input),
    );
    if (!zone) throw new InvalidMenuError("zone_not_found", "id");
    return zone;
  }

  async removeZone(tenantId: TenantId, id: number): Promise<void> {
    const deleted = await this.store.deleteDeliveryZone(tenantId, id);
    if (!deleted) throw new InvalidMenuError("zone_not_found", "id");
  }
}
