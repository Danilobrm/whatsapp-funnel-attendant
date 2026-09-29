import { tenantQuery } from "../../../config/tenantQuery.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { Cart, CartAddress, CartLine, CartStatus } from "../types/cart.types.js";
import type { Fulfillment } from "../types/order.types.js";
import type { PaymentMethod } from "../../store/types/store.types.js";

interface CartRow {
  items: CartLine[];
  fulfillment: Fulfillment | null;
  address: CartAddress | null;
  zone_id: number | null;
  payment_method: PaymentMethod | null;
  change_for_cents: number | null;
  notes: string | null;
  status: CartStatus;
  summary_hash: string | null;
  updated_at: Date | string;
}

function toCart(row: CartRow): Cart {
  return {
    items: row.items,
    fulfillment: row.fulfillment,
    address: row.address,
    zoneId: row.zone_id,
    paymentMethod: row.payment_method,
    changeForCents: row.change_for_cents,
    notes: row.notes,
    status: row.status,
    summaryHash: row.summary_hash,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
  };
}

/** `null` = a conversa não tem carrinho gravado. */
export async function findCart(
  tenantId: TenantId,
  conversationId: number,
): Promise<Cart | null> {
  const result = await tenantQuery<CartRow>(
    tenantId,
    `SELECT items, fulfillment, address, zone_id, payment_method,
            change_for_cents, notes, status, summary_hash, updated_at
       FROM carts
      WHERE tenant_id = $1 AND conversation_id = $2`,
    [tenantId, conversationId],
  );
  const row = result.rows[0];
  return row ? toCart(row) : null;
}

/**
 * Grava o carrinho inteiro (upsert). O `EXISTS` garante que a conversa é do
 * tenant: id de outro tenant vira no-op em vez de criar carrinho alheio.
 */
export async function saveCart(
  tenantId: TenantId,
  conversationId: number,
  cart: Cart,
): Promise<void> {
  await tenantQuery(
    tenantId,
    `INSERT INTO carts (
       conversation_id, tenant_id, items, fulfillment, address, zone_id,
       payment_method, change_for_cents, notes, status, summary_hash, updated_at
     )
     SELECT $2, $1, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM conversations WHERE id = $2 AND tenant_id = $1)
     ON CONFLICT (conversation_id) DO UPDATE
        SET items = EXCLUDED.items,
            fulfillment = EXCLUDED.fulfillment,
            address = EXCLUDED.address,
            zone_id = EXCLUDED.zone_id,
            payment_method = EXCLUDED.payment_method,
            change_for_cents = EXCLUDED.change_for_cents,
            notes = EXCLUDED.notes,
            status = EXCLUDED.status,
            summary_hash = EXCLUDED.summary_hash,
            updated_at = CURRENT_TIMESTAMP
        WHERE carts.tenant_id = EXCLUDED.tenant_id`,
    [
      tenantId,
      conversationId,
      JSON.stringify(cart.items),
      cart.fulfillment,
      cart.address === null ? null : JSON.stringify(cart.address),
      cart.zoneId,
      cart.paymentMethod,
      cart.changeForCents,
      cart.notes,
      cart.status,
      cart.summaryHash,
    ],
  );
}

export async function deleteCart(
  tenantId: TenantId,
  conversationId: number,
): Promise<void> {
  await tenantQuery(
    tenantId,
    `DELETE FROM carts WHERE tenant_id = $1 AND conversation_id = $2`,
    [tenantId, conversationId],
  );
}

/**
 * Reivindica o carrinho confirmado APAGANDO-O de forma atômica: só uma das
 * chamadas concorrentes (dois "sim" seguidos, reenvio do canal) recebe `true`
 * e cria o pedido. Se a criação falhar, quem chamou regrava o carrinho.
 */
export async function claimConfirmedCart(
  tenantId: TenantId,
  conversationId: number,
  summaryHash: string,
): Promise<boolean> {
  const result = await tenantQuery(
    tenantId,
    `DELETE FROM carts
      WHERE tenant_id = $1 AND conversation_id = $2
        AND status = 'awaiting_confirmation' AND summary_hash = $3`,
    [tenantId, conversationId, summaryHash],
  );
  return (result.rowCount ?? 0) > 0;
}
