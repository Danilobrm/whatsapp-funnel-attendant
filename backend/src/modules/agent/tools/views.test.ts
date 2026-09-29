import { describe, expect, it } from "vitest";

import {
  MENU,
  PRICING_SETTINGS,
  readyCart,
  ZONES,
} from "../../order/utils/fixtures.test-util.js";
import { emptyCart } from "../../order/types/cart.types.js";
import { priceCart } from "../../order/utils/pricing.js";
import {
  cartView,
  describeProblem,
  menuItemView,
  searchMenu,
} from "./views.js";

import type { PricingProblemCode } from "../../order/utils/pricing.js";

describe("searchMenu", () => {
  it("returns an overview by category when the query is empty", () => {
    const result = searchMenu(MENU, "  ");

    expect(result.items).toEqual([]);
    expect(result.overview).toEqual([
      { category: "Pizzas", items: ["Pizza"] },
      { category: "Lanches", items: ["X-Burger"] },
      { category: "Bebidas", items: ["Coca 2L", "Suco de Laranja"] },
    ]);
  });

  it("finds by name without accents or case", () => {
    const { items } = searchMenu(MENU, "COCA");

    expect(items.map((i) => i.name)).toEqual(["Coca 2L"]);
  });

  it("finds a pizza by a FLAVOR or SIZE (they live in options and sizes)", () => {
    expect(searchMenu(MENU, "calabresa").items.map((i) => i.name)).toEqual([
      "Pizza",
    ]);
    expect(searchMenu(MENU, "grande").items.map((i) => i.name)).toEqual([
      "Pizza",
    ]);
  });

  it("requires every word, then relaxes to any word when nothing matches", () => {
    expect(
      searchMenu(MENU, "pizza calabresa").items.map((i) => i.name),
    ).toEqual(["Pizza"]);
    // "sushi" não existe; "coca" existe → cai no "qualquer palavra"
    expect(searchMenu(MENU, "sushi coca").items.map((i) => i.name)).toEqual([
      "Coca 2L",
    ]);
    expect(searchMenu(MENU, "sushi").items).toEqual([]);
  });

  it("never returns inactive items or items of inactive categories", () => {
    const menu = structuredClone(MENU);
    const lanches = menu[1];
    if (!lanches) throw new Error("fixture");
    lanches.active = false;

    expect(searchMenu(menu, "burger").items).toEqual([]);
  });

  it("still lists a sold-out item, flagged as unavailable", () => {
    const [suco] = searchMenu(MENU, "suco").items;

    expect(suco).toMatchObject({ name: "Suco de Laranja", available: false });
  });
});

describe("menuItemView", () => {
  it("exposes sizes with formatted prices and option surcharges", () => {
    const pizza = MENU[0]?.items[0];
    if (!pizza) throw new Error("fixture");

    const view = menuItemView(pizza, "Pizzas");

    expect(view.sizes).toEqual([
      { id: 101, name: "Média", price: "R$ 45,00" },
      { id: 102, name: "Grande", price: "R$ 58,00" },
    ]);
    expect(view.price).toBeUndefined();
    const flavors = view.optionGroups[0];
    expect(flavors).toMatchObject({ id: 1001, minSelect: 2, maxSelect: 2 });
    expect(flavors?.priceRule).toContain("MÉDIA");
    expect(flavors?.options.map((o) => o.price)).toEqual([
      "sem acréscimo",
      "sem acréscimo",
      "+R$ 5,00",
      "sem acréscimo",
    ]);
  });

  it("exposes a single price for an item without sizes", () => {
    const coca = MENU[2]?.items[0];
    if (!coca) throw new Error("fixture");

    expect(menuItemView(coca, "Bebidas")).toMatchObject({ price: "R$ 12,00" });
  });
});

describe("cartView", () => {
  it("shows numbered lines, formatted money and nothing pending for a ready cart", () => {
    const cart = readyCart();
    const view = cartView(
      cart,
      priceCart(cart, MENU, ZONES[0] ?? null, PRICING_SETTINGS),
    );

    expect(view).toMatchObject({
      status: "open",
      subtotal: "R$ 68,50",
      fee: "R$ 5,00",
      total: "R$ 73,50",
      totalCents: 7350,
      fulfillment: "delivery",
      address: "Rua das Flores, 12 - Centro",
      payment: "Pix",
      changeFor: null,
      pending: [],
    });
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]).toMatchObject({
      number: 1,
      name: "Pizza",
      size: "Grande",
      quantity: 1,
      total: "R$ 68,50",
    });
    expect(view.lines[0]?.options).toEqual([
      "Sabores: Calabresa",
      "Sabores: Quatro Queijos",
      "Borda: Catupiry",
    ]);
  });

  it("lists what is still missing in Portuguese", () => {
    const cart = emptyCart();
    const view = cartView(cart, priceCart(cart, MENU, null, PRICING_SETTINGS));

    expect(view.pending).toEqual([
      "o carrinho está vazio",
      "falta definir entrega ou retirada",
      "falta a forma de pagamento",
    ]);
  });
});

describe("describeProblem", () => {
  const cases: [PricingProblemCode, number | null, string | null, RegExp][] = [
    ["empty_cart", null, null, /vazio/],
    ["invalid_quantity", 1, null, /linha 2: quantidade inválida/],
    ["item_unavailable", 0, "Suco", /linha 1: Suco não está disponível/],
    ["size_required", 0, "Pizza", /Pizza: falta escolher o tamanho/],
    ["size_invalid", 0, "Pizza", /tamanho inválido/],
    ["price_unavailable", 0, "Pizza", /sem preço/],
    ["option_invalid", 0, "Bacon", /opção "Bacon"/],
    ["option_group_required", 0, "Sabores", /falta escolher em "Sabores"/],
    ["option_group_max_exceeded", 0, "Sabores", /escolhas demais/],
    ["below_minimum", null, "2000", /R\$ 20,00/],
    ["fulfillment_required", null, null, /entrega ou retirada/],
    ["fulfillment_unavailable", null, "delivery", /não está fazendo entregas/],
    ["address_required", null, null, /endereço/],
    ["zone_required", null, null, /bairro/],
    ["zone_not_served", null, "Centro", /não entregamos em Centro/],
    ["payment_required", null, null, /forma de pagamento/],
    ["payment_unavailable", null, "pix", /não aceita/],
    ["change_too_low", null, "7350", /R\$ 73,50/],
  ];

  it.each(cases)("%s", (code, lineIndex, label, pattern) => {
    expect(describeProblem({ code, lineIndex, label })).toMatch(pattern);
  });

  it("says pickup when pickup is the unavailable one", () => {
    expect(
      describeProblem({
        code: "fulfillment_unavailable",
        lineIndex: null,
        label: "pickup",
      }),
    ).toMatch(/retirada/);
  });
});
