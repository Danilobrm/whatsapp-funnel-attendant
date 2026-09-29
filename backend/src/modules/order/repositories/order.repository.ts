import { tenantQuery } from "../../../config/tenantQuery.js";
import {
  clientTenantQuery,
  withTransaction,
} from "../../../config/transaction.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type {
  NewOrderInput,
  Order,
  OrderAddress,
  OrderItem,
  OrderItemOption,
  OrderStatus,
  RejectReason,
} from "../types/order.types.js";

interface OrderRow {
  id: number;
  number: number;
  conversation_id: number | null;
  customer_name: string;
  customer_phone: string | null;
  status: OrderStatus;
  fulfillment: Order["fulfillment"];
  address: OrderAddress | null;
  neighborhood: string | null;
  payment_method: string;
  change_for_cents: number | null;
  subtotal_cents: number;
  fee_cents: number;
  total_cents: number;
  notes: string | null;
  reject_reason: RejectReason | null;
  reject_note: string | null;
  created_at: Date | string;
  accepted_at: Date | string | null;
  ready_at: Date | string | null;
  completed_at: Date | string | null;
  updated_at: Date | string;
}

interface ItemRow {
  order_id: number;
  name: string;
  size_name: string | null;
  unit_price_cents: number;
  quantity: number;
  options: OrderItemOption[] | null;
  notes: string | null;
}

const ORDER_COLUMNS = `id, number, conversation_id, customer_name, customer_phone,
  status, fulfillment, address, neighborhood, payment_method, change_for_cents,
  subtotal_cents, fee_cents, total_cents, notes, reject_reason, reject_note,
  created_at, accepted_at, ready_at, completed_at, updated_at`;

function iso(value: Date | string): string;
function iso(value: Date | string | null): string | null;
function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toItem(row: ItemRow): OrderItem {
  return {
    name: row.name,
    sizeName: row.size_name,
    unitPriceCents: row.unit_price_cents,
    quantity: row.quantity,
    options: row.options ?? [],
    notes: row.notes,
  };
}

function toOrder(row: OrderRow, items: OrderItem[]): Order {
  return {
    id: row.id,
    number: row.number,
    conversationId: row.conversation_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    status: row.status,
    fulfillment: row.fulfillment,
    address: row.address,
    neighborhood: row.neighborhood,
    paymentMethod: row.payment_method,
    changeForCents: row.change_for_cents,
    subtotalCents: row.subtotal_cents,
    feeCents: row.fee_cents,
    totalCents: row.total_cents,
    notes: row.notes,
    rejectReason: row.reject_reason,
    rejectNote: row.reject_note,
    createdAt: iso(row.created_at),
    acceptedAt: iso(row.accepted_at),
    readyAt: iso(row.ready_at),
    completedAt: iso(row.completed_at),
    updatedAt: iso(row.updated_at),
    items,
  };
}

/** Busca os itens de vários pedidos numa query só e remonta os pedidos. */
async function attachItems(
  tenantId: TenantId,
  rows: OrderRow[],
): Promise<Order[]> {
  if (rows.length === 0) return [];
  const result = await tenantQuery<ItemRow>(
    tenantId,
    `SELECT order_id, name, size_name, unit_price_cents, quantity, options, notes
       FROM order_items
      WHERE tenant_id = $1 AND order_id = ANY($2::int[])
      ORDER BY order_id, position, id`,
    [tenantId, rows.map((r) => r.id)],
  );

  const byOrder = new Map<number, OrderItem[]>();
  for (const row of result.rows) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push(toItem(row));
    byOrder.set(row.order_id, list);
  }
  return rows.map((row) => toOrder(row, byOrder.get(row.id) ?? []));
}

/**
 * Grava pedido + itens numa transação. O número vem do contador do tenant
 * (upsert atômico), então dois pedidos simultâneos nunca repetem número.
 * `conversationId` de outro tenant vira NULL (o `EXISTS` não casa) em vez de
 * ligar o pedido à conversa alheia.
 */
export async function insertOrder(
  tenantId: TenantId,
  input: NewOrderInput,
): Promise<Order> {
  const id = await withTransaction(async (client) => {
    const counter = await clientTenantQuery<{ last_number: number }>(
      client,
      tenantId,
      `INSERT INTO order_counters (tenant_id, last_number)
       VALUES ($1, 1)
       ON CONFLICT (tenant_id) DO UPDATE
          SET last_number = order_counters.last_number + 1
       RETURNING last_number`,
      [tenantId],
    );
    const number = counter.rows[0]?.last_number;
    if (number === undefined) throw new Error("Falha ao numerar o pedido");

    const inserted = await clientTenantQuery<{ id: number }>(
      client,
      tenantId,
      `INSERT INTO orders (
         tenant_id, number, conversation_id, customer_name, customer_phone,
         fulfillment, address, neighborhood, payment_method, change_for_cents,
         subtotal_cents, fee_cents, total_cents, notes, customer_id
       )
       VALUES (
         $1, $2,
         (SELECT id FROM conversations WHERE id = $3 AND tenant_id = $1),
         $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         (SELECT id FROM customers WHERE id = $15 AND tenant_id = $1)
       )
       RETURNING id`,
      [
        tenantId,
        number,
        input.conversationId,
        input.customerName,
        input.customerPhone,
        input.fulfillment,
        input.address === null ? null : JSON.stringify(input.address),
        input.neighborhood,
        input.paymentMethod,
        input.changeForCents,
        input.subtotalCents,
        input.feeCents,
        input.totalCents,
        input.notes,
        input.customerId ?? null,
      ],
    );
    const orderId = inserted.rows[0]?.id;
    if (orderId === undefined) throw new Error("Falha ao gravar o pedido");

    for (const [position, item] of input.items.entries()) {
      await clientTenantQuery(
        client,
        tenantId,
        `INSERT INTO order_items (
           tenant_id, order_id, name, size_name, unit_price_cents, quantity,
           options, notes, position
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          tenantId,
          orderId,
          item.name,
          item.sizeName,
          item.unitPriceCents,
          item.quantity,
          JSON.stringify(item.options),
          item.notes,
          position,
        ],
      );
    }
    return orderId;
  });

  const order = await findOrderById(tenantId, id);
  if (!order) throw new Error("Pedido gravado não encontrado");
  return order;
}

export async function findOrderById(
  tenantId: TenantId,
  id: number,
): Promise<Order | null> {
  const result = await tenantQuery<OrderRow>(
    tenantId,
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  const [order] = await attachItems(tenantId, result.rows);
  return order ?? null;
}

/**
 * Último pedido REAL do cliente (rejeitado/cancelado não conta como "o de
 * sempre"). Alimenta "quer o mesmo de sábado?".
 */
export async function findLastOrderForCustomer(
  tenantId: TenantId,
  customerId: number,
): Promise<Order | null> {
  const result = await tenantQuery<OrderRow>(
    tenantId,
    `SELECT ${ORDER_COLUMNS}
       FROM orders
      WHERE tenant_id = $1 AND customer_id = $2
        AND status NOT IN ('rejected', 'cancelled')
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [tenantId, customerId],
  );
  const [order] = await attachItems(tenantId, result.rows);
  return order ?? null;
}

/**
 * O quadro do balcão: todo pedido ainda em andamento (de qualquer dia — um
 * pedido esquecido de ontem precisa aparecer) + os encerrados desde
 * `dayStart` (início do dia no fuso da loja).
 */
export async function listBoardOrders(
  tenantId: TenantId,
  dayStart: Date,
): Promise<Order[]> {
  const result = await tenantQuery<OrderRow>(
    tenantId,
    `SELECT ${ORDER_COLUMNS}
       FROM orders
      WHERE tenant_id = $1
        AND (status NOT IN ('completed', 'rejected', 'cancelled')
             OR created_at >= $2)
      ORDER BY created_at ASC, id ASC`,
    [tenantId, dayStart.toISOString()],
  );
  return attachItems(tenantId, result.rows);
}

const TIMESTAMP_FOR: Partial<Record<OrderStatus, string>> = {
  accepted: "accepted_at",
  out_for_delivery: "ready_at",
  ready_for_pickup: "ready_at",
  completed: "completed_at",
};

/**
 * Muda o status só se ele ainda for `from`. Duas abas clicando "aceitar" ao
 * mesmo tempo: a segunda atualiza 0 linhas e recebe `null` — quem chama
 * trata como transição inválida.
 */
export async function updateOrderStatus(
  tenantId: TenantId,
  id: number,
  from: OrderStatus,
  to: OrderStatus,
  reject: { reason: RejectReason | null; note: string | null },
): Promise<Order | null> {
  const timestampColumn = TIMESTAMP_FOR[to];
  const result = await tenantQuery<{ id: number }>(
    tenantId,
    `UPDATE orders
        SET status = $4,
            reject_reason = $5,
            reject_note = $6,
            ${timestampColumn ? `${timestampColumn} = CURRENT_TIMESTAMP,` : ""}
            updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND id = $2 AND status = $3
      RETURNING id`,
    [tenantId, id, from, to, reject.reason, reject.note],
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return findOrderById(tenantId, id);
}
