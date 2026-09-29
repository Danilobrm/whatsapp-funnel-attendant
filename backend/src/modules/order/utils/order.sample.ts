import { InvalidOrderError } from "../errors/order.errors.js";

import type { Menu, MenuItem } from "../../menu/types/menu.types.js";
import type { DeliveryZone, PaymentMethod } from "../../store/types/store.types.js";
import type { NewOrderInput, OrderItem } from "../types/order.types.js";

/**
 * Pedido de TESTE (só em dev), montado do cardápio real. Existe porque a
 * Fase 2 (agente montando pedido) ainda não existe e o quadro do balcão
 * precisa de pedidos para ser exercitado.
 *
 * Sem `priceCart` (Fase 2), só entra item cujo preço é trivial: sem grupo de
 * opção obrigatório. Tamanho = o primeiro. Pura: a aleatoriedade vem de `rng`.
 */
const SAMPLE_CUSTOMERS = [
  { name: "Ana Souza", phone: "5561990000001" },
  { name: "Bruno Lima", phone: "5561990000002" },
  { name: "Carla Mendes", phone: "5561990000003" },
  { name: "Diego Rocha", phone: "5561990000004" },
  { name: "Elisa Martins", phone: "5561990000005" },
];

const SAMPLE_STREETS = [
  "Rua das Flores",
  "Av. Brasil",
  "Rua 7",
  "Rua do Comércio",
];

export interface SampleContext {
  menu: Menu;
  zones: DeliveryZone[];
  paymentMethods: PaymentMethod[];
  conversationId: number | null;
  rng?: () => number;
}

function pick<T>(list: readonly T[], rng: () => number): T {
  const value = list[Math.floor(rng() * list.length)];
  if (value === undefined) throw new Error("pick em lista vazia");
  return value;
}

function isSampleable(item: MenuItem): boolean {
  if (!item.active || !item.available) return false;
  if (item.optionGroups.some((g) => g.minSelect > 0)) return false;
  return item.sizes.length > 0 || item.priceCents !== null;
}

function toLine(item: MenuItem, rng: () => number): OrderItem {
  const size = item.sizes[0] ?? null;
  return {
    name: item.name,
    sizeName: size?.name ?? null,
    unitPriceCents: size?.priceCents ?? item.priceCents ?? 0,
    quantity: rng() < 0.7 ? 1 : 2,
    options: [],
    notes: null,
  };
}

export function buildSampleOrder(ctx: SampleContext): NewOrderInput {
  const rng = ctx.rng ?? Math.random;
  const candidates = ctx.menu
    .filter((c) => c.active)
    .flatMap((c) => c.items)
    .filter(isSampleable);
  if (candidates.length === 0) {
    throw new InvalidOrderError("menu_empty", "menu");
  }

  const lineCount = 1 + Math.floor(rng() * Math.min(3, candidates.length));
  const pool = [...candidates];
  const items: OrderItem[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    const index = Math.floor(rng() * pool.length);
    const [chosen] = pool.splice(index, 1);
    if (chosen) items.push(toLine(chosen, rng));
  }

  const subtotalCents = items.reduce(
    (sum, i) => sum + i.unitPriceCents * i.quantity,
    0,
  );
  const activeZones = ctx.zones.filter((z) => z.active);
  const zone =
    activeZones.length > 0 && rng() < 0.7 ? pick(activeZones, rng) : null;
  const feeCents = zone?.feeCents ?? 0;
  const totalCents = subtotalCents + feeCents;
  const paymentMethod =
    ctx.paymentMethods.length > 0 ? pick(ctx.paymentMethods, rng) : "pix";
  const customer = pick(SAMPLE_CUSTOMERS, rng);

  return {
    conversationId: ctx.conversationId,
    customerName: customer.name,
    customerPhone: customer.phone,
    fulfillment: zone ? "delivery" : "pickup",
    address: zone
      ? {
          street: pick(SAMPLE_STREETS, rng),
          number: String(10 + Math.floor(rng() * 900)),
          complement: null,
          reference: null,
        }
      : null,
    neighborhood: zone?.neighborhood ?? null,
    paymentMethod,
    // Troco para o próximo múltiplo de R$ 50 — o caso comum no balcão.
    changeForCents:
      paymentMethod === "cash"
        ? Math.ceil((totalCents + 1) / 5000) * 5000
        : null,
    subtotalCents,
    feeCents,
    totalCents,
    notes: null,
    items,
  };
}
