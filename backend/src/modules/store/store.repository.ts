import { query } from "../../config/db.js";
import { normalizeNeighborhood } from "./neighborhood.js";

import type { TenantId } from "../tenants/tenant.types.js";
import type { OpeningHours } from "./store.hours.js";
import type {
  DeliveryZone,
  DeliveryZoneInput,
  PaymentMethod,
  StoreSettings,
} from "./store.types.js";

interface StoreSettingsRow {
  timezone: string;
  opening_hours: OpeningHours;
  paused: boolean;
  min_order_cents: number;
  estimated_minutes: number;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  payment_methods: PaymentMethod[];
  pix_key: string | null;
  owner_whatsapp: string | null;
  updated_at: Date | string | null;
}

function toStoreSettings(row: StoreSettingsRow): StoreSettings {
  return {
    timezone: row.timezone,
    openingHours: row.opening_hours,
    paused: row.paused,
    minOrderCents: row.min_order_cents,
    estimatedMinutes: row.estimated_minutes,
    pickupEnabled: row.pickup_enabled,
    deliveryEnabled: row.delivery_enabled,
    paymentMethods: row.payment_methods,
    pixKey: row.pix_key,
    ownerWhatsapp: row.owner_whatsapp,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : (row.updated_at ?? null),
  };
}

const STORE_SETTINGS_COLUMNS = `timezone, opening_hours, paused, min_order_cents,
       estimated_minutes, pickup_enabled, delivery_enabled, payment_methods,
       pix_key, owner_whatsapp, updated_at`;

/** `null` quando o tenant ainda não personalizou a loja — o serviço cai nos defaults. */
export async function findStoreSettings(
  tenantId: TenantId,
): Promise<StoreSettings | null> {
  const result = await query<StoreSettingsRow>(
    `SELECT ${STORE_SETTINGS_COLUMNS}
       FROM store_settings
      WHERE tenant_id = $1`,
    [tenantId],
  );

  const row = result.rows[0];
  return row ? toStoreSettings(row) : null;
}

export async function saveStoreSettings(
  tenantId: TenantId,
  settings: Omit<StoreSettings, "updatedAt">,
): Promise<StoreSettings> {
  const result = await query<StoreSettingsRow>(
    `INSERT INTO store_settings (
        tenant_id, timezone, opening_hours, paused, min_order_cents,
        estimated_minutes, pickup_enabled, delivery_enabled,
        payment_methods, pix_key, owner_whatsapp, updated_at
     ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9::text[], $10, $11, CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id) DO UPDATE
        SET timezone = EXCLUDED.timezone,
            opening_hours = EXCLUDED.opening_hours,
            paused = EXCLUDED.paused,
            min_order_cents = EXCLUDED.min_order_cents,
            estimated_minutes = EXCLUDED.estimated_minutes,
            pickup_enabled = EXCLUDED.pickup_enabled,
            delivery_enabled = EXCLUDED.delivery_enabled,
            payment_methods = EXCLUDED.payment_methods,
            pix_key = EXCLUDED.pix_key,
            owner_whatsapp = EXCLUDED.owner_whatsapp,
            updated_at = CURRENT_TIMESTAMP
     RETURNING ${STORE_SETTINGS_COLUMNS}`,
    [
      tenantId,
      settings.timezone,
      JSON.stringify(settings.openingHours),
      settings.paused,
      settings.minOrderCents,
      settings.estimatedMinutes,
      settings.pickupEnabled,
      settings.deliveryEnabled,
      settings.paymentMethods,
      settings.pixKey,
      settings.ownerWhatsapp,
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Falha ao salvar as configurações da loja");
  return toStoreSettings(row);
}

interface DeliveryZoneRow {
  id: number;
  neighborhood: string;
  fee_cents: number;
  active: boolean;
}

function toZone(row: DeliveryZoneRow): DeliveryZone {
  return {
    id: row.id,
    neighborhood: row.neighborhood,
    feeCents: row.fee_cents,
    active: row.active,
  };
}

export async function listDeliveryZones(
  tenantId: TenantId,
): Promise<DeliveryZone[]> {
  const result = await query<DeliveryZoneRow>(
    `SELECT id, neighborhood, fee_cents, active
       FROM delivery_zones
      WHERE tenant_id = $1
      ORDER BY neighborhood ASC`,
    [tenantId],
  );
  return result.rows.map(toZone);
}

export async function createDeliveryZone(
  tenantId: TenantId,
  input: DeliveryZoneInput,
): Promise<DeliveryZone> {
  const result = await query<DeliveryZoneRow>(
    `INSERT INTO delivery_zones (tenant_id, neighborhood, neighborhood_key, fee_cents, active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, neighborhood, fee_cents, active`,
    [
      tenantId,
      input.neighborhood,
      normalizeNeighborhood(input.neighborhood),
      input.feeCents,
      input.active,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Falha ao criar a zona de entrega");
  return toZone(row);
}

export async function updateDeliveryZone(
  tenantId: TenantId,
  id: number,
  input: DeliveryZoneInput,
): Promise<DeliveryZone | null> {
  const result = await query<DeliveryZoneRow>(
    `UPDATE delivery_zones
        SET neighborhood = $3,
            neighborhood_key = $4,
            fee_cents = $5,
            active = $6
      WHERE tenant_id = $1 AND id = $2
      RETURNING id, neighborhood, fee_cents, active`,
    [
      tenantId,
      id,
      input.neighborhood,
      normalizeNeighborhood(input.neighborhood),
      input.feeCents,
      input.active,
    ],
  );
  const row = result.rows[0];
  return row ? toZone(row) : null;
}

export async function deleteDeliveryZone(
  tenantId: TenantId,
  id: number,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM delivery_zones WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  return (result.rowCount ?? 0) > 0;
}
