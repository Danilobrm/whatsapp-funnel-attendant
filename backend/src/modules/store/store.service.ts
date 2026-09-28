import { InvalidMenuError } from "../errors/invalidMenu.error.js";
import {
  createDeliveryZone,
  deleteDeliveryZone,
  findStoreSettings,
  listDeliveryZones,
  saveStoreSettings,
  updateDeliveryZone,
} from "./store.repository.js";
import { DAY_KEYS, type DayInterval, type OpeningHours } from "./store.hours.js";
import { PAYMENT_METHODS, type PaymentMethod } from "./store.types.js";

import type { TenantId } from "../tenants/tenant.types.js";
import type { DeliveryZone, StoreSettings } from "./store.types.js";

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  timezone: "America/Sao_Paulo",
  openingHours: {},
  paused: false,
  minOrderCents: 0,
  estimatedMinutes: 40,
  pickupEnabled: true,
  deliveryEnabled: true,
  paymentMethods: ["pix", "cash"],
  pixKey: null,
  ownerWhatsapp: null,
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
}

function parseOpeningHours(raw: unknown): OpeningHours {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidMenuError("opening_hours_invalid", "openingHours");
  }

  const input = raw as Record<string, unknown>;
  const result: OpeningHours = {};

  for (const [day, value] of Object.entries(input)) {
    if (!(DAY_KEYS as readonly string[]).includes(day)) {
      throw new InvalidMenuError("opening_hours_invalid", "openingHours");
    }
    if (!Array.isArray(value)) {
      throw new InvalidMenuError("opening_hours_invalid", "openingHours");
    }

    const intervals: DayInterval[] = value.map((entry) => {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string" ||
        typeof entry[1] !== "string" ||
        !TIME_RE.test(entry[0]) ||
        !TIME_RE.test(entry[1])
      ) {
        throw new InvalidMenuError("opening_hours_invalid", "openingHours");
      }
      return [entry[0], entry[1]];
    });

    result[day as keyof OpeningHours] = intervals;
  }

  return result;
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Puro — valida a entrada da UI antes de tocar no banco. */
export function parseStoreSettings(input: unknown): Omit<StoreSettings, "updatedAt"> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const timezone = typeof raw.timezone === "string" ? raw.timezone.trim() : "";
  if (timezone.length === 0 || !isValidTimezone(timezone)) {
    throw new InvalidMenuError("timezone_required", "timezone");
  }

  const openingHours = parseOpeningHours(raw.openingHours);

  const paused = raw.paused === true;

  const minOrderCents = raw.minOrderCents;
  if (
    typeof minOrderCents !== "number" ||
    !Number.isInteger(minOrderCents) ||
    minOrderCents < 0
  ) {
    throw new InvalidMenuError("min_order_invalid", "minOrderCents");
  }

  const estimatedMinutes = raw.estimatedMinutes;
  if (
    typeof estimatedMinutes !== "number" ||
    !Number.isInteger(estimatedMinutes) ||
    estimatedMinutes <= 0
  ) {
    throw new InvalidMenuError("estimated_minutes_invalid", "estimatedMinutes");
  }

  const pickupEnabled = raw.pickupEnabled === true;
  const deliveryEnabled = raw.deliveryEnabled === true;
  if (!pickupEnabled && !deliveryEnabled) {
    throw new InvalidMenuError("fulfillment_required", "pickupEnabled");
  }

  const paymentMethods = Array.isArray(raw.paymentMethods)
    ? [...new Set(raw.paymentMethods)]
    : [];
  if (paymentMethods.length === 0 || !paymentMethods.every(isPaymentMethod)) {
    throw new InvalidMenuError("unknown_payment_method", "paymentMethods");
  }

  const pixKey =
    typeof raw.pixKey === "string" && raw.pixKey.trim().length > 0
      ? raw.pixKey.trim()
      : null;
  const ownerWhatsapp =
    typeof raw.ownerWhatsapp === "string" && raw.ownerWhatsapp.trim().length > 0
      ? raw.ownerWhatsapp.trim()
      : null;

  return {
    timezone,
    openingHours,
    paused,
    minOrderCents,
    estimatedMinutes,
    pickupEnabled,
    deliveryEnabled,
    paymentMethods: paymentMethods as PaymentMethod[],
    pixKey,
    ownerWhatsapp,
  };
}

/**
 * Cache por tenant, mesmo padrão de `settings.service.ts`: TTL curto,
 * invalidado na escrita, expiração preguiçosa na leitura (sem `setInterval`
 * — travaria o teardown do vitest).
 */
const STORE_CACHE_TTL_MS = 30_000;

interface StoreCacheEntry {
  value: StoreSettings;
  expiresAt: number;
}

const cache = new Map<TenantId, StoreCacheEntry>();

export function invalidateStoreSettingsCache(tenantId?: TenantId): void {
  if (tenantId === undefined) {
    cache.clear();
  } else {
    cache.delete(tenantId);
  }
}

export async function getStoreSettings(tenantId: TenantId): Promise<StoreSettings> {
  const now = Date.now();
  const hit = cache.get(tenantId);
  if (hit !== undefined && hit.expiresAt > now) {
    return hit.value;
  }
  if (hit !== undefined) {
    cache.delete(tenantId);
  }

  const stored = await findStoreSettings(tenantId);
  const value = stored ?? { ...DEFAULT_STORE_SETTINGS };
  cache.set(tenantId, { value, expiresAt: now + STORE_CACHE_TTL_MS });
  return value;
}

export async function updateStoreSettings(
  tenantId: TenantId,
  input: unknown,
): Promise<StoreSettings> {
  const saved = await saveStoreSettings(tenantId, parseStoreSettings(input));
  cache.set(tenantId, { value: saved, expiresAt: Date.now() + STORE_CACHE_TTL_MS });
  return saved;
}

function parseZoneInput(input: unknown): Omit<DeliveryZone, "id"> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const neighborhood =
    typeof raw.neighborhood === "string" ? raw.neighborhood.trim() : "";
  if (neighborhood.length === 0) {
    throw new InvalidMenuError("neighborhood_required", "neighborhood");
  }

  const feeCents = raw.feeCents;
  if (typeof feeCents !== "number" || !Number.isInteger(feeCents) || feeCents < 0) {
    throw new InvalidMenuError("fee_invalid", "feeCents");
  }

  const active = raw.active !== false;

  return { neighborhood, feeCents, active };
}

export function listZones(tenantId: TenantId): Promise<DeliveryZone[]> {
  return listDeliveryZones(tenantId);
}

export async function createZone(
  tenantId: TenantId,
  input: unknown,
): Promise<DeliveryZone> {
  return createDeliveryZone(tenantId, parseZoneInput(input));
}

export async function updateZone(
  tenantId: TenantId,
  id: number,
  input: unknown,
): Promise<DeliveryZone> {
  const zone = await updateDeliveryZone(tenantId, id, parseZoneInput(input));
  if (!zone) throw new InvalidMenuError("zone_not_found", "id");
  return zone;
}

export async function removeZone(tenantId: TenantId, id: number): Promise<void> {
  const deleted = await deleteDeliveryZone(tenantId, id);
  if (!deleted) throw new InvalidMenuError("zone_not_found", "id");
}
