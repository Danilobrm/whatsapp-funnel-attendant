import { EventEmitter } from "node:events";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { OrderEvent } from "../types/order.types.js";

/**
 * Barramento em memória dos eventos de pedido, um canal por tenant. Quem
 * escuta é o SSE (`GET /api/orders/stream`) de cada painel aberto.
 *
 * Vale para UMA instância do backend (a v1). Com mais de uma, o pedido criado
 * na instância A não chega ao painel conectado na B — aí este módulo vira
 * Redis pub/sub (ou LISTEN/NOTIFY do Postgres) com a mesma interface.
 */
const bus = new EventEmitter();
// Um listener por aba de painel aberta; o default (10) avisaria à toa.
bus.setMaxListeners(0);

function channel(tenantId: TenantId): string {
  return `orders:${tenantId}`;
}

export function publishOrderEvent(tenantId: TenantId, event: OrderEvent): void {
  bus.emit(channel(tenantId), event);
}

export function subscribeOrders(
  tenantId: TenantId,
  listener: (event: OrderEvent) => void,
): () => void {
  bus.on(channel(tenantId), listener);
  return () => {
    bus.off(channel(tenantId), listener);
  };
}
