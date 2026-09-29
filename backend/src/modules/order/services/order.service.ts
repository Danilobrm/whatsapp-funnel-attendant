import { upsertConversation } from "../../conversation/repositories/conversation.repository.js";
import { sendOutbound } from "../../conversation/services/conversation.service.js";
import { getFullMenu } from "../../menu/services/menu.service.js";
import { getStoreSettings, listZones } from "../../store/services/store.service.js";
import {
  InvalidOrderError,
  InvalidTransitionError,
  OrderNotFoundError,
} from "../errors/order.errors.js";
import { publishOrderEvent } from "../events/order.events.js";
import { customerMessageFor } from "../utils/order.messages.js";
import {
  findOrderById,
  insertOrder,
  listBoardOrders,
  updateOrderStatus,
} from "../repositories/order.repository.js";
import { buildSampleOrder } from "../utils/order.sample.js";
import { canTransition } from "../utils/order.status.js";
import { startOfDayInZone } from "../utils/order.time.js";
import { ORDER_STATUSES, REJECT_REASONS } from "../types/order.types.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type {
  NewOrderInput,
  Order,
  OrderStatus,
  RejectReason,
  TransitionInput,
} from "../types/order.types.js";

const MAX_NOTE_CHARS = 280;

/**
 * Porta única de criação de pedido. Hoje chamada pelo pedido de teste; na
 * Fase 2, pelo `place_order` do agente. Publica `order_created` para os
 * painéis abertos.
 */
export async function createOrder(
  tenantId: TenantId,
  input: NewOrderInput,
): Promise<Order> {
  if (input.customerName.trim().length === 0) {
    throw new InvalidOrderError("customer_name_required", "customerName");
  }
  if (input.items.length === 0) {
    throw new InvalidOrderError("items_required", "items");
  }
  const order = await insertOrder(tenantId, input);
  publishOrderEvent(tenantId, { type: "order_created", order });
  return order;
}

export async function listBoard(tenantId: TenantId): Promise<Order[]> {
  const settings = await getStoreSettings(tenantId);
  return listBoardOrders(
    tenantId,
    startOfDayInZone(new Date(), settings.timezone),
  );
}

export async function getOrder(tenantId: TenantId, id: number): Promise<Order> {
  const order = await findOrderById(tenantId, id);
  if (!order) throw new OrderNotFoundError();
  return order;
}

/** Valida o corpo de `POST /:id/transition` (vem cru do cliente). */
export function parseTransitionInput(body: unknown): TransitionInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (!ORDER_STATUSES.includes(raw.to as OrderStatus)) {
    throw new InvalidOrderError("invalid_status", "to");
  }
  const to = raw.to as OrderStatus;
  if (to !== "rejected") return { to };

  if (!REJECT_REASONS.includes(raw.reason as RejectReason)) {
    throw new InvalidOrderError("reject_reason_required", "reason");
  }
  const reason = raw.reason as RejectReason;
  const note =
    typeof raw.note === "string" && raw.note.trim().length > 0
      ? raw.note.trim().slice(0, MAX_NOTE_CHARS)
      : null;
  if (reason === "other" && note === null) {
    throw new InvalidOrderError("reject_note_required", "note");
  }
  return { to, reason, note };
}

/**
 * Avança o pedido, avisa os painéis e manda a mensagem ao cliente.
 *
 * A mensagem vem DEPOIS da gravação e sua falha é engolida: o status já
 * mudou, e desfazer a transição porque o WhatsApp oscilou deixaria o balcão
 * e o banco discordando.
 */
export async function transitionOrder(
  tenantId: TenantId,
  id: number,
  input: TransitionInput,
): Promise<Order> {
  const current = await getOrder(tenantId, id);
  if (!canTransition(current.status, input.to, current.fulfillment)) {
    throw new InvalidTransitionError(current.status, input.to);
  }

  const updated = await updateOrderStatus(
    tenantId,
    id,
    current.status,
    input.to,
    {
      reason: input.to === "rejected" ? (input.reason ?? null) : null,
      note: input.to === "rejected" ? (input.note ?? null) : null,
    },
  );
  // Outra aba mudou o status entre a leitura e o UPDATE.
  if (!updated) throw new InvalidTransitionError(current.status, input.to);

  publishOrderEvent(tenantId, { type: "order_updated", order: updated });
  await notifyCustomer(tenantId, updated);
  return updated;
}

async function notifyCustomer(tenantId: TenantId, order: Order): Promise<void> {
  if (order.conversationId === null) return;
  try {
    const settings = await getStoreSettings(tenantId);
    const text = customerMessageFor(order, settings.estimatedMinutes);
    if (text) await sendOutbound(tenantId, order.conversationId, text);
  } catch (err) {
    console.error(
      `[orders] falha ao avisar o cliente do pedido #${order.number}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Pedido de teste (dev). Ligado à conversa do SIMULADOR de quem clicou, para
 * as mensagens de status aparecerem em `/admin/simulator`.
 */
export async function createSampleOrder(
  tenantId: TenantId,
  userId: number,
): Promise<Order> {
  const [menu, zones, settings] = await Promise.all([
    getFullMenu(tenantId),
    listZones(tenantId),
    getStoreSettings(tenantId),
  ]);
  const input = buildSampleOrder({
    menu,
    zones,
    paymentMethods: settings.paymentMethods,
    conversationId: null,
  });
  const conversation = await upsertConversation(
    tenantId,
    "simulator",
    `admin-${userId}`,
    null,
  );
  return createOrder(tenantId, { ...input, conversationId: conversation.id });
}
