import { describe, expect, it } from "vitest";

import {
  parseAddItem,
  parseCallHuman,
  parseLineNumber,
  parseSearchMenu,
  parseSetFulfillment,
  parseSetPayment,
  parseUpdateQuantity,
} from "./args.js";

describe("parseSearchMenu", () => {
  it("accepts a query, and an absent one (overview)", () => {
    expect(parseSearchMenu({ query: "calabresa" })).toEqual({
      ok: true,
      value: { query: "calabresa" },
    });
    expect(parseSearchMenu({})).toEqual({ ok: true, value: { query: "" } });
    expect(parseSearchMenu(undefined)).toEqual({
      ok: true,
      value: { query: "" },
    });
  });

  it("rejects a non-text query and caps the length", () => {
    expect(parseSearchMenu({ query: 5 }).ok).toBe(false);
    const long = parseSearchMenu({ query: "a".repeat(500) });
    expect(long.ok && long.value.query.length).toBe(120);
  });
});

describe("parseAddItem", () => {
  it("parses the full shape", () => {
    expect(
      parseAddItem({
        item_id: 10,
        size_id: 102,
        option_ids: [2001, 2003],
        quantity: 2,
        notes: " bem assada ",
      }),
    ).toEqual({
      ok: true,
      value: {
        itemId: 10,
        sizeId: 102,
        optionIds: [2001, 2003],
        quantity: 2,
        notes: "bem assada",
      },
    });
  });

  it("defaults: quantity 1, no size, no options, no notes", () => {
    expect(parseAddItem({ item_id: 30 })).toEqual({
      ok: true,
      value: {
        itemId: 30,
        sizeId: null,
        optionIds: [],
        quantity: 1,
        notes: null,
      },
    });
  });

  // Modelo pequeno manda "12" no lugar de 12 e null no lugar de omitir.
  it("tolerates numeric strings and nulls, which small models produce", () => {
    expect(
      parseAddItem({
        item_id: "12",
        size_id: null,
        option_ids: ["5", 6],
        quantity: "2",
      }),
    ).toEqual({
      ok: true,
      value: {
        itemId: 12,
        sizeId: null,
        optionIds: [5, 6],
        quantity: 2,
        notes: null,
      },
    });
  });

  it("dedupes option ids", () => {
    const parsed = parseAddItem({ item_id: 1, option_ids: [3, 3, 4] });
    expect(parsed.ok && parsed.value.optionIds).toEqual([3, 4]);
  });

  it.each([
    ["missing item_id", {}],
    ["item_id text", { item_id: "pizza" }],
    ["item_id float", { item_id: 1.5 }],
    ["size_id text", { item_id: 1, size_id: "grande" }],
    ["option_ids not a list", { item_id: 1, option_ids: 5 }],
    ["option_ids with text", { item_id: 1, option_ids: ["calabresa"] }],
    ["quantity text", { item_id: 1, quantity: "duas" }],
    ["not an object", "oi"],
  ])("rejects %s", (_name, raw) => {
    expect(parseAddItem(raw).ok).toBe(false);
  });
});

describe("line numbers", () => {
  it("parseLineNumber needs a positive integer", () => {
    expect(parseLineNumber({ line_number: 2 })).toEqual({
      ok: true,
      value: { line: 2 },
    });
    expect(parseLineNumber({ line_number: "1" })).toEqual({
      ok: true,
      value: { line: 1 },
    });
    expect(parseLineNumber({ line_number: 0 }).ok).toBe(false);
    expect(parseLineNumber({}).ok).toBe(false);
  });

  it("parseUpdateQuantity needs both", () => {
    expect(parseUpdateQuantity({ line_number: 1, quantity: 3 })).toEqual({
      ok: true,
      value: { line: 1, quantity: 3 },
    });
    expect(parseUpdateQuantity({ line_number: 1 }).ok).toBe(false);
    expect(parseUpdateQuantity({ quantity: 3 }).ok).toBe(false);
  });
});

describe("parseSetFulfillment", () => {
  it("parses delivery with address and neighborhood", () => {
    expect(
      parseSetFulfillment({
        type: "delivery",
        address: { street: " Rua 7 ", number: 12, complement: "ap 3" },
        neighborhood: "Centro",
      }),
    ).toEqual({
      ok: true,
      value: {
        type: "delivery",
        street: "Rua 7",
        number: "12",
        complement: "ap 3",
        reference: null,
        neighborhood: "Centro",
      },
    });
  });

  // Modelo pequeno erra o formato do endereço; aceita-se o que é inequívoco.
  it("accepts the address as plain text or loose at the top level", () => {
    expect(
      parseSetFulfillment({
        type: "delivery",
        address: "Rua 7, 12",
        neighborhood: "Centro",
      }),
    ).toMatchObject({
      ok: true,
      value: { street: "Rua 7, 12", neighborhood: "Centro" },
    });

    expect(
      parseSetFulfillment({
        type: "delivery",
        street: "Rua 7",
        number: "12",
        neighborhood: "Centro",
      }),
    ).toMatchObject({ ok: true, value: { street: "Rua 7", number: "12" } });

    expect(
      parseSetFulfillment({
        type: "delivery",
        address: { street: "Rua 7", neighborhood: "Centro" },
      }),
    ).toMatchObject({ ok: true, value: { neighborhood: "Centro" } });
  });

  it("parses pickup with no address", () => {
    expect(parseSetFulfillment({ type: "pickup" })).toMatchObject({
      ok: true,
      value: { type: "pickup", street: null, neighborhood: null },
    });
  });

  it("rejects an unknown type", () => {
    expect(parseSetFulfillment({ type: "drone" }).ok).toBe(false);
    expect(parseSetFulfillment({}).ok).toBe(false);
  });
});

describe("parseSetPayment", () => {
  it("accepts the three methods", () => {
    for (const method of ["pix", "cash", "card_on_delivery"]) {
      expect(parseSetPayment({ method }).ok).toBe(true);
    }
    expect(parseSetPayment({ method: "boleto" }).ok).toBe(false);
  });

  // O modelo fala em reais; a conversão para centavos é nossa.
  it("converts change from reais to integer cents", () => {
    expect(parseSetPayment({ method: "cash", change_for_reais: 100 })).toEqual({
      ok: true,
      value: { method: "cash", changeForCents: 10000 },
    });
    expect(
      parseSetPayment({ method: "cash", change_for_reais: "50,50" }),
    ).toEqual({
      ok: true,
      value: { method: "cash", changeForCents: 5050 },
    });
    // 19.99 * 100 = 1998.9999999999998 em float
    expect(
      parseSetPayment({ method: "cash", change_for_reais: 19.99 }),
    ).toEqual({
      ok: true,
      value: { method: "cash", changeForCents: 1999 },
    });
  });

  it("treats 0/null/absent change as no change", () => {
    for (const change_for_reais of [0, null, undefined]) {
      expect(parseSetPayment({ method: "cash", change_for_reais })).toEqual({
        ok: true,
        value: { method: "cash", changeForCents: null },
      });
    }
  });

  it("rejects absurd, negative or non-numeric change", () => {
    for (const change_for_reais of [-5, 10001, "cem", Number.NaN]) {
      expect(parseSetPayment({ method: "cash", change_for_reais }).ok).toBe(
        false,
      );
    }
  });

  it("rejects change for a non-cash method", () => {
    expect(parseSetPayment({ method: "pix", change_for_reais: 100 }).ok).toBe(
      false,
    );
  });
});

describe("parseCallHuman", () => {
  it("keeps the reason, with a default", () => {
    expect(parseCallHuman({ reason: "reclamação" })).toEqual({
      ok: true,
      value: { reason: "reclamação" },
    });
    expect(parseCallHuman({})).toEqual({
      ok: true,
      value: { reason: "sem motivo informado" },
    });
  });
});
