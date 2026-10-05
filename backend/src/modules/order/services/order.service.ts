import { Injectable, Logger } from "@nestjs/common";

import { ConversationRepository } from "../../conversation/repositories/conversation.repository.js";
import { OutboundMessenger } from "../../conversation/services/outbound.service.js";
import { MenuService } from "../../menu/services/menu.service.js";
import { StoreService } from "../../store/services/store.service.js";
import {
  InvalidOrderError,
  InvalidTransitionError,
  OrderNotFoundError,
} from "../errors/order.errors.js";
import { OrderEvents } from "../events/order.events.js";
import { OrderRepository } from "../repositories/order.repository.js";
import { customerMessageFor } from "../utils/order.messages.js";
import { buildSampleOrder } from "../utils/order.sample.js";
import { canTransition } from "../utils/order.status.js";
import { startOfDayInZone } from "../utils/order.time.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type {
  NewOrderInput,
  Order,
  TransitionInput,
} from "../types/order.types.js";

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly orders: OrderRepository,
    private readonly events: OrderEvents,
    private readonly conversations: ConversationRepository,
    private readonly outbound: OutboundMessenger,
    private readonly menu: MenuService,
    private readonly store: StoreService,
  ) {}

  /**
   * Porta única de criação de pedido. Chamada pelo `place_order` do agente,
   * pelo pedido de teste e pelo seed. Publica `order_created` para os painéis
   * abertos.
   */
  async createOrder(tenantId: TenantId, input: NewOrderInput): Promise<Order> {
    if (input.customerName.trim().length === 0) {
      throw new InvalidOrderError("customer_name_required", "customerName");
    }
    if (input.items.length === 0) {
      throw new InvalidOrderError("items_required", "items");
    }
    const order = await this.orders.insertOrder(tenantId, input);
    this.events.publishOrderEvent(tenantId, { type: "order_created", order });
    return order;
  }

  async listBoard(tenantId: TenantId): Promise<Order[]> {
    const settings = await this.store.getStoreSettings(tenantId);
    return this.orders.listBoardOrders(
      tenantId,
      startOfDayInZone(new Date(), settings.timezone),
    );
  }

  async getOrder(tenantId: TenantId, id: number): Promise<Order> {
    const order = await this.orders.findOrderById(tenantId, id);
    if (!order) throw new OrderNotFoundError();
    return order;
  }

  /**
   * Avança o pedido, avisa os painéis e manda a mensagem ao cliente.
   *
   * A mensagem vem DEPOIS da gravação e sua falha é engolida: o status já
   * mudou, e desfazer a transição porque o WhatsApp oscilou deixaria o balcão
   * e o banco discordando.
   */
  async transitionOrder(
    tenantId: TenantId,
    id: number,
    input: TransitionInput,
  ): Promise<Order> {
    const current = await this.getOrder(tenantId, id);
    if (!canTransition(current.status, input.to, current.fulfillment)) {
      throw new InvalidTransitionError(current.status, input.to);
    }

    const updated = await this.orders.updateOrderStatus(
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

    this.events.publishOrderEvent(tenantId, {
      type: "order_updated",
      order: updated,
    });
    await this.notifyCustomer(tenantId, updated);
    return updated;
  }

  private async notifyCustomer(
    tenantId: TenantId,
    order: Order,
  ): Promise<void> {
    if (order.conversationId === null) return;
    try {
      const settings = await this.store.getStoreSettings(tenantId);
      const text = customerMessageFor(order, settings.estimatedMinutes);
      if (text) {
        await this.outbound.sendOutbound(tenantId, order.conversationId, text);
      }
    } catch (err) {
      this.logger.error(
        `falha ao avisar o cliente do pedido #${order.number}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Pedido de teste (dev). Ligado à conversa do SIMULADOR de quem clicou, para
   * as mensagens de status aparecerem em `/admin/simulator`.
   */
  async createSampleOrder(tenantId: TenantId, userId: number): Promise<Order> {
    const [menu, zones, settings] = await Promise.all([
      this.menu.getFullMenu(tenantId),
      this.store.listZones(tenantId),
      this.store.getStoreSettings(tenantId),
    ]);
    const input = buildSampleOrder({
      menu,
      zones,
      paymentMethods: settings.paymentMethods,
      conversationId: null,
    });
    const conversation = await this.conversations.upsertConversation(
      tenantId,
      "simulator",
      `admin-${userId}`,
      null,
    );
    return this.createOrder(tenantId, {
      ...input,
      conversationId: conversation.id,
    });
  }
}
