import { Injectable } from "@nestjs/common";

import { ConversationRepository } from "../../conversation/repositories/conversation.repository.js";
import { CustomerRepository } from "../../customer/repositories/customer.repository.js";
import { MenuService } from "../../menu/services/menu.service.js";
import { CartService } from "../../order/services/cart.service.js";
import { StoreService } from "../../store/services/store.service.js";
import { cartView } from "../../agent/tools/views.js";
import { InvalidInputError } from "../../errors/invalidInput.error.js";
import { priceCart } from "../../order/utils/pricing.js";
import { PHONE_RE } from "../utils/simulator.contact.js";

import type { CartView } from "../../agent/tools/views.js";
import type { Customer } from "../../customer/types/customer.types.js";
import type { TenantId } from "../../tenants/types/tenant.types.js";

/**
 * Clientes de teste do simulador. Cada um é uma conversa própria
 * (`contact = sim-<telefone>`, canal `simulator`) e um registro em
 * `customers` — o que permite testar "cliente recorrente" e vários pedidos
 * simultâneos sem WhatsApp.
 */

const MAX_NAME_CHARS = 80;

export interface SimulatedCustomer {
  /** Vai em `contactId` nas chamadas do simulador. */
  contactId: string;
  name: string | null;
  phone: string;
}

function toSimulated(customer: Customer): SimulatedCustomer {
  return {
    contactId: customer.phone,
    name: customer.name,
    phone: customer.phone,
  };
}

@Injectable()
export class SimulatorService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly customers: CustomerRepository,
    private readonly menu: MenuService,
    private readonly carts: CartService,
    private readonly store: StoreService,
  ) {}

  async listCustomers(tenantId: TenantId): Promise<SimulatedCustomer[]> {
    return (await this.customers.listSimulatedCustomers(tenantId)).map(
      toSimulated,
    );
  }

  async createCustomer(
    tenantId: TenantId,
    body: unknown,
  ): Promise<SimulatedCustomer> {
    const raw = (body ?? {}) as { name?: unknown; phone?: unknown };
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (name.length === 0) throw new InvalidInputError("name_required", "name");
    if (name.length > MAX_NAME_CHARS) {
      throw new InvalidInputError("name_too_long", "name");
    }
    const phone =
      typeof raw.phone === "string" ? raw.phone.replace(/\D/g, "") : "";
    if (!PHONE_RE.test(phone))
      throw new InvalidInputError("phone_invalid", "phone");

    const customer = await this.customers.upsertCustomer(tenantId, phone, name);
    await this.conversations.upsertConversation(
      tenantId,
      "simulator",
      `sim-${phone}`,
      name,
    );
    return toSimulated(customer);
  }

  /** Carrinho da conversa de teste, já precificado. `null` = sem conversa/carrinho. */
  async getSimulatorCart(
    tenantId: TenantId,
    contact: string,
  ): Promise<CartView | null> {
    const conversationId = await this.conversations.findConversationId(
      tenantId,
      "simulator",
      contact,
    );
    if (conversationId === null) return null;

    const cart = await this.carts.getCart(tenantId, conversationId);
    if (cart.items.length === 0 && cart.fulfillment === null) return null;

    const [menu, settings, zones] = await Promise.all([
      this.menu.getPublishedMenu(tenantId),
      this.store.getStoreSettings(tenantId),
      this.store.listZones(tenantId),
    ]);
    const zone = zones.find((z) => z.id === cart.zoneId) ?? null;
    return cartView(cart, priceCart(cart, menu, zone, settings));
  }
}
