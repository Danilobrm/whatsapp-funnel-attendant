import { formatBRL } from "../../../lib/money.js";
import { normalizeNeighborhood } from "../../store/utils/neighborhood.js";
import { paymentLabel } from "../../order/utils/summary.js";

import type { Cart, CartStatus } from "../../order/types/cart.types.js";
import type { PricedCart, PricingProblem } from "../../order/utils/pricing.js";
import type { Menu, MenuItem } from "../../menu/types/menu.types.js";

/**
 * Visões em JSON do que as ferramentas devolvem ao modelo (e o painel do
 * simulador mostra). Puras. Todo valor em reais já vem FORMATADO ao lado do
 * valor em centavos: o modelo repete o texto pronto, não calcula nem formata.
 */

const PRICING_NOTE: Record<string, string> = {
  sum: "os preços das opções escolhidas somam",
  max: "vale o preço da opção mais cara escolhida",
  average:
    "vale a MÉDIA dos preços das opções escolhidas (ex.: pizza meio a meio)",
};

export function describeProblem(problem: PricingProblem): string {
  const line =
    problem.lineIndex === null ? "" : `linha ${problem.lineIndex + 1}: `;
  const label = problem.label ?? "";
  switch (problem.code) {
    case "empty_cart":
      return "o carrinho está vazio";
    case "invalid_quantity":
      return `${line}quantidade inválida (use de 1 a 50)`;
    case "item_unavailable":
      return `${line}${label || "item"} não está disponível (removido ou esgotado)`.trim();
    case "size_required":
      return `${line}${label}: falta escolher o tamanho`;
    case "size_invalid":
      return `${line}${label}: tamanho inválido`;
    case "price_unavailable":
      return `${line}${label}: sem preço cadastrado`;
    case "option_invalid":
      return `${line}opção "${label}" inválida ou indisponível`;
    case "option_group_required":
      return `${line}falta escolher em "${label}"`;
    case "option_group_max_exceeded":
      return `${line}escolhas demais em "${label}"`;
    case "below_minimum":
      return `pedido mínimo é ${formatBRL(Number(label))} (sem a taxa de entrega)`;
    case "fulfillment_required":
      return "falta definir entrega ou retirada";
    case "fulfillment_unavailable":
      return label === "delivery"
        ? "a loja não está fazendo entregas"
        : "a loja não está fazendo retirada";
    case "address_required":
      return "falta o endereço de entrega";
    case "zone_required":
      return "falta informar o bairro de entrega";
    case "zone_not_served":
      return `não entregamos em ${label}`;
    case "payment_required":
      return "falta a forma de pagamento";
    case "payment_unavailable":
      return `a loja não aceita a forma de pagamento escolhida`;
    case "change_too_low":
      return `o troco precisa ser para um valor maior ou igual ao total (${formatBRL(Number(label))})`;
  }
}

export interface CartLineView {
  number: number;
  name: string;
  size: string | null;
  options: string[];
  quantity: number;
  unitPriceCents: number;
  unitPrice: string;
  totalCents: number;
  total: string;
  notes: string | null;
}

export interface CartView {
  status: CartStatus;
  lines: CartLineView[];
  subtotalCents: number;
  subtotal: string;
  feeCents: number;
  fee: string;
  totalCents: number;
  total: string;
  fulfillment: "delivery" | "pickup" | null;
  address: string | null;
  payment: string | null;
  changeFor: string | null;
  notes: string | null;
  /** O que ainda impede de pedir o resumo. Vazio = pronto para `request_confirmation`. */
  pending: string[];
}

export function addressLine(cart: Cart): string | null {
  const a = cart.address;
  if (!a) return null;
  const street = [a.street, a.number].filter(Boolean).join(", ");
  return [street, a.complement, a.neighborhood].filter(Boolean).join(" - ");
}

export function cartView(cart: Cart, priced: PricedCart): CartView {
  return {
    status: cart.status,
    lines: priced.lines.map((l) => ({
      number: l.index + 1,
      name: l.name,
      size: l.sizeName,
      options: l.options.map((o) => `${o.group}: ${o.name}`),
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      unitPrice: formatBRL(l.unitPriceCents),
      totalCents: l.lineTotalCents,
      total: formatBRL(l.lineTotalCents),
      notes: l.notes,
    })),
    subtotalCents: priced.subtotalCents,
    subtotal: formatBRL(priced.subtotalCents),
    feeCents: priced.feeCents,
    fee: formatBRL(priced.feeCents),
    totalCents: priced.totalCents,
    total: formatBRL(priced.totalCents),
    fulfillment: cart.fulfillment,
    address: addressLine(cart),
    payment: cart.paymentMethod ? paymentLabel(cart.paymentMethod) : null,
    changeFor:
      cart.changeForCents === null ? null : formatBRL(cart.changeForCents),
    notes: cart.notes,
    pending: priced.problems.map(describeProblem),
  };
}

// ---------------------------------------------------------------- cardápio

export interface MenuItemView {
  id: number;
  name: string;
  category: string;
  description: string | null;
  available: boolean;
  price?: string;
  sizes?: { id: number; name: string; price: string }[];
  optionGroups: {
    id: number;
    name: string;
    minSelect: number;
    maxSelect: number;
    priceRule: string;
    options: { id: number; name: string; price: string; available: boolean }[];
  }[];
}

export function menuItemView(item: MenuItem, category: string): MenuItemView {
  return {
    id: item.id,
    name: item.name,
    category,
    description: item.description,
    available: item.available,
    ...(item.sizes.length > 0
      ? {
          sizes: item.sizes.map((s) => ({
            id: s.id,
            name: s.name,
            price: formatBRL(s.priceCents),
          })),
        }
      : item.priceCents !== null
        ? { price: formatBRL(item.priceCents) }
        : {}),
    optionGroups: item.optionGroups.map((g) => ({
      id: g.id,
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      priceRule: PRICING_NOTE[g.pricingRule] ?? g.pricingRule,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        // Sabores/adicionais: valor é ACRÉSCIMO sobre o preço base.
        price:
          o.priceCents === 0 ? "sem acréscimo" : `+${formatBRL(o.priceCents)}`,
        available: o.available,
      })),
    })),
  };
}

const MAX_SEARCH_RESULTS = 8;

/**
 * Busca no cardápio publicado, sem acento/caixa. Casa se TODAS as palavras da
 * consulta aparecem no nome, descrição, categoria, tamanhos ou opções; sem resultado, tenta ao
 * menos uma palavra. Consulta vazia devolve a visão geral por categoria.
 */
export function searchMenu(
  menu: Menu,
  query: string,
): {
  items: MenuItemView[];
  overview?: { category: string; items: string[] }[];
} {
  const words = normalizeNeighborhood(query)
    .split(" ")
    .filter((w) => w.length > 1);

  if (words.length === 0) {
    return {
      items: [],
      overview: menu
        .filter((c) => c.active)
        .map((c) => ({
          category: c.name,
          items: c.items.filter((i) => i.active).map((i) => i.name),
        }))
        .filter((c) => c.items.length > 0),
    };
  }

  const candidates = menu
    .filter((c) => c.active)
    .flatMap((c) =>
      c.items
        .filter((i) => i.active)
        .map((item) => ({ item, category: c.name })),
    )
    .map((entry) => ({
      ...entry,
      haystack: normalizeNeighborhood(
        [
          entry.item.name,
          entry.item.description ?? "",
          entry.category,
          ...entry.item.sizes.map((s) => s.name),
          ...entry.item.optionGroups.flatMap((g) =>
            g.options.map((o) => o.name),
          ),
        ].join(" "),
      ),
    }));

  let hits = candidates.filter((c) =>
    words.every((w) => c.haystack.includes(w)),
  );
  if (hits.length === 0) {
    hits = candidates.filter((c) => words.some((w) => c.haystack.includes(w)));
  }

  return {
    items: hits
      .slice(0, MAX_SEARCH_RESULTS)
      .map((c) => menuItemView(c.item, c.category)),
  };
}
