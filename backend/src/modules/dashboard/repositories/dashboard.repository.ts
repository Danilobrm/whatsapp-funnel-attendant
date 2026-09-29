import { tenantQuery } from "../../../config/tenantQuery.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type {
  BreakdownEntry,
  DailyTotal,
  TopItem,
} from "../types/dashboard.types.js";

/**
 * Leituras agregadas do dashboard. "Válido" = tudo menos recusado/cancelado:
 * conta pedido por STATUS, nunca mensagem (o dashboard do faq-chatbot errou
 * justamente contando mensagens como atendimento).
 */
const VALID = `status NOT IN ('rejected', 'cancelled')`;

export async function dailyTotals(
  tenantId: TenantId,
  since: Date,
  timeZone: string,
): Promise<DailyTotal[]> {
  const result = await tenantQuery<{
    day: string;
    orders: string;
    revenue_cents: string | null;
    rejected: string;
  }>(
    tenantId,
    `SELECT to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day,
            COUNT(*) FILTER (WHERE ${VALID}) AS orders,
            SUM(total_cents) FILTER (WHERE ${VALID}) AS revenue_cents,
            COUNT(*) FILTER (WHERE NOT (${VALID})) AS rejected
       FROM orders
      WHERE tenant_id = $1 AND created_at >= $2
      GROUP BY 1
      ORDER BY 1`,
    [tenantId, since.toISOString(), timeZone],
  );
  // COUNT/SUM chegam como string (bigint/numeric no pg).
  return result.rows.map((r) => ({
    day: r.day,
    orders: Number(r.orders),
    revenueCents: Number(r.revenue_cents ?? 0),
    rejected: Number(r.rejected),
  }));
}

export async function topItems(
  tenantId: TenantId,
  since: Date,
  limit: number,
): Promise<TopItem[]> {
  const result = await tenantQuery<{
    name: string;
    quantity: string;
    revenue_cents: string;
  }>(
    tenantId,
    `SELECT i.name,
            SUM(i.quantity) AS quantity,
            SUM(i.unit_price_cents * i.quantity) AS revenue_cents
       FROM order_items i
       JOIN orders o ON o.id = i.order_id AND o.tenant_id = i.tenant_id
      WHERE i.tenant_id = $1 AND o.tenant_id = $1
        AND o.created_at >= $2
        AND o.${VALID}
      GROUP BY i.name
      ORDER BY quantity DESC, revenue_cents DESC, i.name
      LIMIT $3`,
    [tenantId, since.toISOString(), limit],
  );
  return result.rows.map((r) => ({
    name: r.name,
    quantity: Number(r.quantity),
    revenueCents: Number(r.revenue_cents),
  }));
}

/** Contagem de pedidos válidos por `column` (só as duas abaixo — nunca interpolar entrada). */
export async function breakdown(
  tenantId: TenantId,
  since: Date,
  column: "fulfillment" | "payment_method",
): Promise<BreakdownEntry[]> {
  const result = await tenantQuery<{ key: string; count: string }>(
    tenantId,
    `SELECT ${column}::text AS key, COUNT(*) AS count
       FROM orders
      WHERE tenant_id = $1 AND created_at >= $2 AND ${VALID}
      GROUP BY 1
      ORDER BY count DESC, key`,
    [tenantId, since.toISOString()],
  );
  return result.rows.map((r) => ({ key: r.key, count: Number(r.count) }));
}

export async function countActive(tenantId: TenantId): Promise<number> {
  const result = await tenantQuery<{ count: string }>(
    tenantId,
    `SELECT COUNT(*) AS count
       FROM orders
      WHERE tenant_id = $1
        AND status IN ('pending', 'accepted', 'out_for_delivery', 'ready_for_pickup')`,
    [tenantId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
