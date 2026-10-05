import { describe, expect, it } from "vitest";

import { emptyCart } from "../types/cart.types.js";
import { groupExtraCents, priceCart } from "./pricing.js";
import {
  MENU,
  PRICING_SETTINGS,
  readyCart,
  ZONES,
} from "./fixtures.test-util.js";

import type { Cart } from "../types/cart.types.js";
import type { PricingProblemCode } from "./pricing.js";

const CENTRO = ZONES[0] ?? null;

function price(cart: Cart, over: Partial<typeof PRICING_SETTINGS> = {}) {
  const zone = ZONES.find((z) => z.id === cart.zoneId) ?? null;
  return priceCart(cart, MENU, zone, { ...PRICING_SETTINGS, ...over });
}

const codes = (cart: Cart, over = {}) =>
  price(cart, over).problems.map((p) => p.code);

describe("groupExtraCents", () => {
  it.each([
    ["sum", [400, 300], 700],
    ["max", [400, 300], 400],
    ["average", [0, 500], 250],
    ["average", [0, 0], 0],
    ["average", [100, 201], 151], // 150,5 → arredonda para centavo inteiro
    ["sum", [], 0],
    ["average", [], 0],
  ] as const)("%s of %j = %i", (rule, prices, expected) => {
    expect(groupExtraCents(rule, prices)).toBe(expected);
  });
});

describe("priceCart — preço", () => {
  it("prices size + half-and-half average + border and delivery fee", () => {
    // Grande 5800 + média(0, 500)=250 + Catupiry 800 = 6850; + taxa 500
    const priced = price(readyCart());

    expect(priced.problems).toEqual([]);
    expect(priced.lines).toHaveLength(1);
    expect(priced.lines[0]).toMatchObject({
      name: "Pizza",
      sizeName: "Grande",
      unitPriceCents: 6850,
      quantity: 1,
      lineTotalCents: 6850,
    });
    expect(priced.lines[0]?.options.map((o) => o.name)).toEqual([
      "Calabresa",
      "Quatro Queijos",
      "Catupiry",
    ]);
    expect(priced.subtotalCents).toBe(6850);
    expect(priced.feeCents).toBe(500);
    expect(priced.totalCents).toBe(7350);
  });

  it("multiplies by quantity", () => {
    const cart = readyCart({
      items: [
        {
          itemId: 20,
          sizeId: null,
          optionIds: [2201, 2202],
          quantity: 3,
          notes: null,
        },
      ],
    });

    const priced = price(cart);

    // 1800 + 400 + 300 = 2500 × 3
    expect(priced.lines[0]?.unitPriceCents).toBe(2500);
    expect(priced.subtotalCents).toBe(7500);
  });

  it("sums several lines", () => {
    const cart = readyCart({
      items: [
        { itemId: 20, sizeId: null, optionIds: [], quantity: 2, notes: null },
        {
          itemId: 30,
          sizeId: null,
          optionIds: [],
          quantity: 1,
          notes: "gelada",
        },
      ],
    });

    const priced = price(cart);

    expect(priced.subtotalCents).toBe(3600 + 1200);
    expect(priced.lines.map((l) => l.index)).toEqual([0, 1]);
    expect(priced.lines[1]?.notes).toBe("gelada");
  });

  it("uses the group rule 'max' when the group says so", () => {
    const menu = structuredClone(MENU);
    const group = menu[1]?.items[0]?.optionGroups[0];
    if (!group) throw new Error("fixture");
    group.pricingRule = "max";
    const cart = readyCart({
      items: [
        {
          itemId: 20,
          sizeId: null,
          optionIds: [2201, 2202],
          quantity: 1,
          notes: null,
        },
      ],
    });

    const priced = priceCart(cart, menu, CENTRO, PRICING_SETTINGS);

    expect(priced.lines[0]?.unitPriceCents).toBe(1800 + 400);
  });

  it("charges no fee on pickup and needs no address", () => {
    const priced = price(
      readyCart({ fulfillment: "pickup", address: null, zoneId: null }),
    );

    expect(priced.problems).toEqual([]);
    expect(priced.feeCents).toBe(0);
    expect(priced.totalCents).toBe(6850);
  });
});

describe("priceCart — problemas", () => {
  it("flags an empty cart", () => {
    expect(codes(emptyCart())).toContain("empty_cart");
  });

  it("flags an item that sold out between adding and confirming", () => {
    const cart = readyCart({
      items: [
        { itemId: 31, sizeId: null, optionIds: [], quantity: 1, notes: null },
      ],
    });

    const priced = price(cart);

    expect(priced.problems).toContainEqual({
      code: "item_unavailable",
      lineIndex: 0,
      label: "Suco de Laranja",
    });
    expect(priced.lines).toEqual([]);
    expect(priced.subtotalCents).toBe(0);
  });

  it("flags an item removed from the menu", () => {
    const cart = readyCart({
      items: [
        { itemId: 999, sizeId: null, optionIds: [], quantity: 1, notes: null },
      ],
    });

    expect(codes(cart)).toContain("item_unavailable");
  });

  it("flags an item in an inactive category as unavailable", () => {
    const menu = structuredClone(MENU);
    const category = menu[2];
    if (!category) throw new Error("fixture");
    category.active = false;
    const cart = readyCart({
      items: [
        { itemId: 30, sizeId: null, optionIds: [], quantity: 1, notes: null },
      ],
    });

    const priced = priceCart(cart, menu, CENTRO, PRICING_SETTINGS);

    expect(priced.problems.map((p) => p.code)).toContain("item_unavailable");
  });

  it.each<[string, Cart["items"], PricingProblemCode]>([
    [
      "size missing",
      [
        {
          itemId: 10,
          sizeId: null,
          optionIds: [2001, 2002],
          quantity: 1,
          notes: null,
        },
      ],
      "size_required",
    ],
    [
      "size of another item",
      [
        {
          itemId: 10,
          sizeId: 555,
          optionIds: [2001, 2002],
          quantity: 1,
          notes: null,
        },
      ],
      "size_invalid",
    ],
    [
      "required flavors missing",
      [{ itemId: 10, sizeId: 101, optionIds: [], quantity: 1, notes: null }],
      "option_group_required",
    ],
    [
      "only one of two flavors",
      [
        {
          itemId: 10,
          sizeId: 101,
          optionIds: [2001],
          quantity: 1,
          notes: null,
        },
      ],
      "option_group_required",
    ],
    [
      "three flavors, max is two",
      [
        {
          itemId: 10,
          sizeId: 101,
          optionIds: [2001, 2002, 2003],
          quantity: 1,
          notes: null,
        },
      ],
      "option_group_max_exceeded",
    ],
    [
      "unavailable option",
      [
        {
          itemId: 10,
          sizeId: 101,
          optionIds: [2001, 2004],
          quantity: 1,
          notes: null,
        },
      ],
      "option_invalid",
    ],
    [
      "option that belongs to another item",
      [
        {
          itemId: 20,
          sizeId: null,
          optionIds: [2001],
          quantity: 1,
          notes: null,
        },
      ],
      "option_invalid",
    ],
    [
      "zero quantity",
      [{ itemId: 30, sizeId: null, optionIds: [], quantity: 0, notes: null }],
      "invalid_quantity",
    ],
    [
      "absurd quantity",
      [{ itemId: 30, sizeId: null, optionIds: [], quantity: 51, notes: null }],
      "invalid_quantity",
    ],
    [
      "fractional quantity",
      [{ itemId: 30, sizeId: null, optionIds: [], quantity: 1.5, notes: null }],
      "invalid_quantity",
    ],
  ])("%s", (_name, items, expected) => {
    const priced = price(readyCart({ items }));

    expect(priced.problems.map((p) => p.code)).toContain(expected);
    // Linha com problema não entra no subtotal.
    expect(priced.lines).toEqual([]);
  });

  it("flags a subtotal below the minimum order (fee does not count)", () => {
    const cart = readyCart({
      items: [
        { itemId: 30, sizeId: null, optionIds: [], quantity: 1, notes: null },
      ],
    });

    const priced = price(cart, { minOrderCents: 2000 });

    expect(priced.problems).toContainEqual({
      code: "below_minimum",
      lineIndex: null,
      label: "2000",
    });
  });

  it("does not flag the minimum when the cart is exactly at it", () => {
    const cart = readyCart({
      items: [
        { itemId: 30, sizeId: null, optionIds: [], quantity: 1, notes: null },
      ],
    });

    expect(codes(cart, { minOrderCents: 1200 })).not.toContain("below_minimum");
  });

  it("requires fulfillment", () => {
    expect(codes(readyCart({ fulfillment: null }))).toContain(
      "fulfillment_required",
    );
  });

  it("refuses delivery when the store does not deliver, and pickup when it does not pick up", () => {
    expect(codes(readyCart(), { deliveryEnabled: false })).toContain(
      "fulfillment_unavailable",
    );
    expect(
      codes(readyCart({ fulfillment: "pickup", address: null, zoneId: null }), {
        pickupEnabled: false,
      }),
    ).toContain("fulfillment_unavailable");
  });

  it("requires an address and a zone for delivery", () => {
    const found = codes(readyCart({ address: null, zoneId: null }));

    expect(found).toContain("address_required");
    expect(found).toContain("zone_required");
  });

  it("refuses a zone that was deactivated after being chosen", () => {
    const priced = price(readyCart({ zoneId: 3 }));

    expect(priced.problems).toContainEqual({
      code: "zone_not_served",
      lineIndex: null,
      label: "Bairro Fechado",
    });
    expect(priced.feeCents).toBe(0);
  });

  it("requires a payment method the store accepts", () => {
    expect(codes(readyCart({ paymentMethod: null }))).toContain(
      "payment_required",
    );
    expect(codes(readyCart(), { paymentMethods: ["cash"] })).toContain(
      "payment_unavailable",
    );
  });

  describe("troco", () => {
    const cash = (changeForCents: number | null) =>
      readyCart({ paymentMethod: "cash", changeForCents });

    it("accepts change for more than the total, and for exactly the total", () => {
      expect(codes(cash(10000))).toEqual([]);
      expect(codes(cash(7350))).toEqual([]); // total = 6850 + 500
    });

    it("flags change for less than the total", () => {
      const priced = price(cash(7000));

      expect(priced.problems).toContainEqual({
        code: "change_too_low",
        lineIndex: null,
        label: "7350",
      });
    });

    it("accepts cash without change", () => {
      expect(codes(cash(null))).toEqual([]);
    });

    it("re-checks the change when the total grows after it was set", () => {
      const cart = cash(7500);
      cart.items = [
        {
          itemId: 10,
          sizeId: 102,
          optionIds: [2001, 2003, 2102],
          quantity: 2,
          notes: null,
        },
      ];

      expect(codes(cart)).toContain("change_too_low");
    });
  });

  it("returns no problems for a complete cart", () => {
    expect(price(readyCart()).problems).toEqual([]);
  });
});
