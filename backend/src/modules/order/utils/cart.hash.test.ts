import { describe, expect, it } from "vitest";

import { cartHash } from "./cart.hash.js";
import { readyCart } from "./fixtures.test-util.js";

describe("cartHash", () => {
  it("is stable for the same content", () => {
    expect(cartHash(readyCart(), 7350)).toBe(cartHash(readyCart(), 7350));
  });

  it("ignores status, summaryHash and updatedAt (they are not content)", () => {
    const a = readyCart();
    const b = readyCart({
      status: "awaiting_confirmation",
      summaryHash: "abc",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(cartHash(a, 100)).toBe(cartHash(b, 100));
  });

  it("does not depend on the order of the chosen options", () => {
    const a = readyCart({
      items: [
        {
          itemId: 10,
          sizeId: 102,
          optionIds: [2001, 2003, 2102],
          quantity: 1,
          notes: null,
        },
      ],
    });
    const b = readyCart({
      items: [
        {
          itemId: 10,
          sizeId: 102,
          optionIds: [2102, 2003, 2001],
          quantity: 1,
          notes: null,
        },
      ],
    });

    expect(cartHash(a, 100)).toBe(cartHash(b, 100));
  });

  it.each<[string, Parameters<typeof readyCart>[0]]>([
    [
      "quantity",
      {
        items: [
          {
            itemId: 10,
            sizeId: 102,
            optionIds: [2001, 2003, 2102],
            quantity: 2,
            notes: null,
          },
        ],
      },
    ],
    [
      "size",
      {
        items: [
          {
            itemId: 10,
            sizeId: 101,
            optionIds: [2001, 2003, 2102],
            quantity: 1,
            notes: null,
          },
        ],
      },
    ],
    [
      "option",
      {
        items: [
          {
            itemId: 10,
            sizeId: 102,
            optionIds: [2001, 2002, 2102],
            quantity: 1,
            notes: null,
          },
        ],
      },
    ],
    [
      "item note",
      {
        items: [
          {
            itemId: 10,
            sizeId: 102,
            optionIds: [2001, 2003, 2102],
            quantity: 1,
            notes: "bem assada",
          },
        ],
      },
    ],
    ["fulfillment", { fulfillment: "pickup", address: null, zoneId: null }],
    ["zone", { zoneId: 2 }],
    ["payment", { paymentMethod: "cash" }],
    ["change", { paymentMethod: "cash", changeForCents: 10000 }],
    ["order note", { notes: "sem pressa" }],
    [
      "street",
      {
        address: {
          street: "Outra Rua",
          number: "12",
          complement: null,
          reference: null,
          neighborhood: "Centro",
        },
      },
    ],
  ])("changes when the %s changes", (_name, over) => {
    expect(cartHash(readyCart(over), 100)).not.toBe(cartHash(readyCart(), 100));
  });

  // Se o preço do cardápio mudar entre o resumo e o "sim", o cliente não
  // confirmou aquele valor.
  it("changes when the total changes", () => {
    expect(cartHash(readyCart(), 7350)).not.toBe(cartHash(readyCart(), 7400));
  });
});
