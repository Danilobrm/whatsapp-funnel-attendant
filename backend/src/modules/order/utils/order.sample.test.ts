import { describe, expect, it } from "vitest";

import { InvalidOrderError } from "../errors/order.errors.js";
import { buildSampleOrder } from "./order.sample.js";

import type { Menu, MenuItem } from "../../menu/types/menu.types.js";

function item(overrides: Partial<MenuItem>): MenuItem {
  return {
    id: 1,
    categoryId: 1,
    name: "X-Burger",
    description: null,
    priceCents: 1800,
    imageUrl: null,
    available: true,
    active: true,
    position: 0,
    sizes: [],
    optionGroups: [],
    ...overrides,
  };
}

function menu(items: MenuItem[]): Menu {
  return [{ id: 1, name: "Lanches", position: 0, active: true, items }];
}

/** rng fixo em 0: primeira escolha sempre, 1 linha, quantidade 1, retirada se sem zona. */
const zero = () => 0;

describe("buildSampleOrder", () => {
  it("monta um pedido de retirada com o item e total certos", () => {
    const order = buildSampleOrder({
      menu: menu([item({})]),
      zones: [],
      paymentMethods: ["pix"],
      conversationId: 9,
      rng: zero,
    });

    expect(order).toMatchObject({
      conversationId: 9,
      fulfillment: "pickup",
      subtotalCents: 1800,
      feeCents: 0,
      totalCents: 1800,
      paymentMethod: "pix",
      changeForCents: null,
    });
    expect(order.items).toEqual([
      expect.objectContaining({
        name: "X-Burger",
        unitPriceCents: 1800,
        quantity: 1,
      }),
    ]);
  });

  it("usa o primeiro tamanho quando o item tem tamanhos", () => {
    const order = buildSampleOrder({
      menu: menu([
        item({
          name: "Pizza",
          priceCents: null,
          sizes: [{ id: 1, name: "Média", priceCents: 4500, position: 0 }],
        }),
      ]),
      zones: [],
      paymentMethods: ["pix"],
      conversationId: null,
      rng: zero,
    });
    expect(order.items[0]).toMatchObject({
      sizeName: "Média",
      unitPriceCents: 4500,
    });
  });

  it("entrega soma a taxa da zona e dinheiro calcula troco", () => {
    const order = buildSampleOrder({
      menu: menu([item({})]),
      zones: [{ id: 1, neighborhood: "Centro", feeCents: 500, active: true }],
      paymentMethods: ["cash"],
      conversationId: null,
      rng: zero,
    });
    expect(order).toMatchObject({
      fulfillment: "delivery",
      neighborhood: "Centro",
      feeCents: 500,
      totalCents: 2300,
      changeForCents: 5000,
    });
  });

  it("pula item esgotado, inativo ou com grupo obrigatório", () => {
    const order = buildSampleOrder({
      menu: menu([
        item({ id: 1, name: "Esgotado", available: false }),
        item({ id: 2, name: "Inativo", active: false }),
        item({
          id: 3,
          name: "Meio a meio",
          optionGroups: [
            {
              id: 1,
              name: "Sabores",
              minSelect: 1,
              maxSelect: 2,
              pricingRule: "average",
              position: 0,
              options: [],
            },
          ],
        }),
        item({ id: 4, name: "Válido" }),
      ]),
      zones: [],
      paymentMethods: ["pix"],
      conversationId: null,
      rng: zero,
    });
    expect(order.items.map((i) => i.name)).toEqual(["Válido"]);
  });

  it("sem item vendável → menu_empty", () => {
    expect(() =>
      buildSampleOrder({
        menu: menu([item({ available: false })]),
        zones: [],
        paymentMethods: ["pix"],
        conversationId: null,
        rng: zero,
      }),
    ).toThrow(InvalidOrderError);
  });
});
