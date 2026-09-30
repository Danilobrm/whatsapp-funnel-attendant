import { EventEmitter } from "node:events";

import { Injectable } from "@nestjs/common";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { OrderEvent } from "../types/order.types.js";

/**
 * Barramento em memória dos eventos de pedido, um canal por tenant. Quem
 * escuta é o SSE (`GET /api/orders/stream`) de cada painel aberto.
 *
 * Vale para UMA instância do backend (a v1). Com mais de uma, o pedido criado
 * na instância A não chega ao painel conectado na B — aí este serviço vira
 * Redis pub/sub (ou LISTEN/NOTIFY do Postgres) com a mesma interface. O
 * emissor é da INSTÂNCIA (singleton do container), não de módulo.
 */
@Injectable()
export class OrderEvents {
  private readonly bus = new EventEmitter();

  constructor() {
    // Um listener por aba de painel aberta; o default (10) avisaria à toa.
    this.bus.setMaxListeners(0);
  }

  private channel(tenantId: TenantId): string {
    return `orders:${tenantId}`;
  }

  publishOrderEvent(tenantId: TenantId, event: OrderEvent): void {
    this.bus.emit(this.channel(tenantId), event);
  }

  subscribeOrders(
    tenantId: TenantId,
    listener: (event: OrderEvent) => void,
  ): () => void {
    this.bus.on(this.channel(tenantId), listener);
    return () => {
      this.bus.off(this.channel(tenantId), listener);
    };
  }
}
