import type {
  Menu,
  MenuItem,
  OptionGroup,
} from "../../menu/types/menu.types.js";
import type {
  DeliveryZone,
  StoreSettings,
} from "../../store/types/store.types.js";
import type { Cart } from "../types/cart.types.js";
import type { OrderItemOption } from "../types/order.types.js";

/**
 * Preço do carrinho — PURO. A IA nunca calcula preço, taxa, total nem troco:
 * tudo sai daqui, a partir do cardápio e da loja.
 */

export const MAX_LINE_QUANTITY = 50;

export type PricingProblemCode =
  | "empty_cart"
  | "invalid_quantity"
  | "item_unavailable"
  | "size_required"
  | "size_invalid"
  | "price_unavailable"
  | "option_invalid"
  | "option_group_required"
  | "option_group_max_exceeded"
  | "below_minimum"
  | "fulfillment_required"
  | "fulfillment_unavailable"
  | "address_required"
  | "zone_required"
  | "zone_not_served"
  | "payment_required"
  | "payment_unavailable"
  | "change_too_low";

export interface PricingProblem {
  code: PricingProblemCode;
  /** Linha do carrinho (0-based) a que o problema se refere, quando há. */
  lineIndex: number | null;
  /** Item, grupo ou valor legível para a mensagem ao modelo/cliente. */
  label: string | null;
}

export interface PricedLine {
  /** Posição da linha no carrinho (`remove_item` / `update_quantity` usam). */
  index: number;
  itemId: number;
  name: string;
  sizeName: string | null;
  options: OrderItemOption[];
  /** Já inclui os adicionais (regra do grupo aplicada). */
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  notes: string | null;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotalCents: number;
  feeCents: number;
  totalCents: number;
  problems: PricingProblem[];
}

export type PricingSettings = Pick<
  StoreSettings,
  "minOrderCents" | "paymentMethods" | "pickupEnabled" | "deliveryEnabled"
>;

/** Extra cobrado por UM grupo, dada a regra e o preço das opções escolhidas. */
export function groupExtraCents(
  rule: OptionGroup["pricingRule"],
  prices: readonly number[],
): number {
  if (prices.length === 0) return 0;
  const sum = prices.reduce((a, b) => a + b, 0);
  if (rule === "max") return Math.max(...prices);
  if (rule === "average") return Math.round(sum / prices.length);
  return sum;
}

export function findMenuItem(menu: Menu, itemId: number): MenuItem | null {
  for (const category of menu) {
    if (!category.active) continue;
    const item = category.items.find((i) => i.id === itemId);
    if (item) return item.active ? item : null;
  }
  return null;
}

interface PricedItem {
  sizeName: string | null;
  options: OrderItemOption[];
  unitPriceCents: number;
}

/** Preço de UMA unidade do item com a escolha dada, ou os problemas achados. */
function priceLine(
  item: MenuItem,
  sizeId: number | null,
  optionIds: readonly number[],
  lineIndex: number,
  problems: PricingProblem[],
): PricedItem | null {
  let base: number;
  let sizeName: string | null = null;

  if (item.sizes.length > 0) {
    if (sizeId === null) {
      problems.push({ code: "size_required", lineIndex, label: item.name });
      return null;
    }
    const size = item.sizes.find((s) => s.id === sizeId);
    if (!size) {
      problems.push({ code: "size_invalid", lineIndex, label: item.name });
      return null;
    }
    base = size.priceCents;
    sizeName = size.name;
  } else if (item.priceCents !== null) {
    base = item.priceCents;
  } else {
    problems.push({ code: "price_unavailable", lineIndex, label: item.name });
    return null;
  }

  const options: OrderItemOption[] = [];
  let extras = 0;
  let ok = true;

  for (const group of item.optionGroups) {
    const chosen = group.options.filter((o) => optionIds.includes(o.id));
    for (const option of chosen) {
      if (!option.available) {
        problems.push({
          code: "option_invalid",
          lineIndex,
          label: option.name,
        });
        ok = false;
      }
    }
    if (chosen.length < group.minSelect) {
      problems.push({
        code: "option_group_required",
        lineIndex,
        label: group.name,
      });
      ok = false;
    }
    if (chosen.length > group.maxSelect) {
      problems.push({
        code: "option_group_max_exceeded",
        lineIndex,
        label: group.name,
      });
      ok = false;
    }
    extras += groupExtraCents(
      group.pricingRule,
      chosen.map((o) => o.priceCents),
    );
    for (const option of chosen) {
      options.push({
        group: group.name,
        name: option.name,
        priceCents: option.priceCents,
      });
    }
  }

  // Id de opção que não pertence a nenhum grupo do item.
  const known = new Set(
    item.optionGroups.flatMap((g) => g.options.map((o) => o.id)),
  );
  for (const id of optionIds) {
    if (!known.has(id)) {
      problems.push({ code: "option_invalid", lineIndex, label: String(id) });
      ok = false;
    }
  }

  if (!ok) return null;
  return { sizeName, options, unitPriceCents: base + extras };
}

export function priceCart(
  cart: Cart,
  menu: Menu,
  zone: DeliveryZone | null,
  settings: PricingSettings,
): PricedCart {
  const problems: PricingProblem[] = [];
  const lines: PricedLine[] = [];

  if (cart.items.length === 0) {
    problems.push({ code: "empty_cart", lineIndex: null, label: null });
  }

  for (const [index, line] of cart.items.entries()) {
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_LINE_QUANTITY
    ) {
      problems.push({
        code: "invalid_quantity",
        lineIndex: index,
        label: null,
      });
      continue;
    }
    const item = findMenuItem(menu, line.itemId);
    if (!item || !item.available) {
      problems.push({
        code: "item_unavailable",
        lineIndex: index,
        label: item?.name ?? null,
      });
      continue;
    }
    const priced = priceLine(
      item,
      line.sizeId,
      line.optionIds,
      index,
      problems,
    );
    if (!priced) continue;
    lines.push({
      index,
      itemId: item.id,
      name: item.name,
      sizeName: priced.sizeName,
      options: priced.options,
      unitPriceCents: priced.unitPriceCents,
      quantity: line.quantity,
      lineTotalCents: priced.unitPriceCents * line.quantity,
      notes: line.notes,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);

  if (lines.length > 0 && subtotalCents < settings.minOrderCents) {
    problems.push({
      code: "below_minimum",
      lineIndex: null,
      label: String(settings.minOrderCents),
    });
  }

  let feeCents = 0;
  if (cart.fulfillment === null) {
    problems.push({
      code: "fulfillment_required",
      lineIndex: null,
      label: null,
    });
  } else if (
    (cart.fulfillment === "delivery" && !settings.deliveryEnabled) ||
    (cart.fulfillment === "pickup" && !settings.pickupEnabled)
  ) {
    problems.push({
      code: "fulfillment_unavailable",
      lineIndex: null,
      label: cart.fulfillment,
    });
  } else if (cart.fulfillment === "delivery") {
    if (cart.address === null) {
      problems.push({ code: "address_required", lineIndex: null, label: null });
    }
    if (cart.zoneId === null || zone === null) {
      problems.push({ code: "zone_required", lineIndex: null, label: null });
    } else if (!zone.active) {
      problems.push({
        code: "zone_not_served",
        lineIndex: null,
        label: zone.neighborhood,
      });
    } else {
      feeCents = zone.feeCents;
    }
  }

  const totalCents = subtotalCents + feeCents;

  if (cart.paymentMethod === null) {
    problems.push({ code: "payment_required", lineIndex: null, label: null });
  } else if (!settings.paymentMethods.includes(cart.paymentMethod)) {
    problems.push({
      code: "payment_unavailable",
      lineIndex: null,
      label: cart.paymentMethod,
    });
  } else if (
    cart.paymentMethod === "cash" &&
    cart.changeForCents !== null &&
    cart.changeForCents < totalCents
  ) {
    problems.push({
      code: "change_too_low",
      lineIndex: null,
      label: String(totalCents),
    });
  }

  return { lines, subtotalCents, feeCents, totalCents, problems };
}
