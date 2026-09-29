import { cartView } from "../../agent/tools/views.js";
import {
  findConversationId,
  upsertConversation,
} from "../../conversation/repositories/conversation.repository.js";
import {
  listSimulatedCustomers,
  upsertCustomer,
} from "../../customer/repositories/customer.repository.js";
import { InvalidInputError } from "../../errors/invalidInput.error.js";
import { getPublishedMenu } from "../../menu/services/menu.service.js";
import { getCart } from "../../order/services/cart.service.js";
import { priceCart } from "../../order/utils/pricing.js";
import {
  getStoreSettings,
  listZones,
} from "../../store/services/store.service.js";

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
const PHONE_RE = /^\d{8,15}$/;

export function simulatorContactFor(
  adminUserId: number,
  contactId: unknown,
): string {
  if (contactId === undefined || contactId === null || contactId === "") {
    return `admin-${adminUserId}`;
  }
  if (typeof contactId !== "string" || !PHONE_RE.test(contactId)) {
    throw new InvalidInputError("invalid_contact", "contactId");
  }
  return `sim-${contactId}`;
}

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

export async function listCustomers(
  tenantId: TenantId,
): Promise<SimulatedCustomer[]> {
  return (await listSimulatedCustomers(tenantId)).map(toSimulated);
}

export async function createCustomer(
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

  const customer = await upsertCustomer(tenantId, phone, name);
  await upsertConversation(tenantId, "simulator", `sim-${phone}`, name);
  return toSimulated(customer);
}

/** Carrinho da conversa de teste, já precificado. `null` = sem conversa/carrinho. */
export async function getSimulatorCart(
  tenantId: TenantId,
  contact: string,
): Promise<CartView | null> {
  const conversationId = await findConversationId(
    tenantId,
    "simulator",
    contact,
  );
  if (conversationId === null) return null;

  const cart = await getCart(tenantId, conversationId);
  if (cart.items.length === 0 && cart.fulfillment === null) return null;

  const [menu, settings, zones] = await Promise.all([
    getPublishedMenu(tenantId),
    getStoreSettings(tenantId),
    listZones(tenantId),
  ]);
  const zone = zones.find((z) => z.id === cart.zoneId) ?? null;
  return cartView(cart, priceCart(cart, menu, zone, settings));
}
