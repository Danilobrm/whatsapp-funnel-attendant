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
  blockingProblems,
  formatCartReceived,
  formatMenuLinkMessage,
  MAX_PUBLIC_CART_LINES,
  parseCartItems,
  RETURN_TEXT,
  toPublicMenu,
  whatsAppReturnUrl,
} from "./menuLink.pure.js";

import type { Cart } from "../../order/types/cart.types.js";

describe("toPublicMenu", () => {
  it("keeps items with sizes, options and the sold-out flag", () => {
    const menu = toPublicMenu(MENU);

    expect(menu.map((c) => c.name)).toEqual(["Pizzas", "Lanches", "Bebidas"]);
    const pizza = menu[0]?.items[0];
    expect(pizza).toMatchObject({
      id: 10,
      name: "Pizza",
      priceCents: null,
      sizes: [
        { id: 101, name: "Média", priceCents: 4500 },
        { id: 102, name: "Grande", priceCents: 5800 },
      ],
    });
    expect(pizza?.optionGroups[0]).toMatchObject({
      id: 1001,
      minSelect: 2,
      maxSelect: 2,
      pricingRule: "average",
    });
    const suco = menu[2]?.items.find((i) => i.id === 31);
    expect(suco?.available).toBe(false);
  });

  it("drops inactive categories, inactive items and categories left empty", () => {
    const menu = structuredClone(MENU);
    const [pizzas, lanches, bebidas] = menu;
    if (!pizzas || !lanches || !bebidas) throw new Error("fixture");
    pizzas.active = false;
    for (const item of lanches.items) item.active = false;
    const [coca] = bebidas.items;
    if (coca) coca.active = false;

    const result = toPublicMenu(menu);

    expect(result.map((c) => c.name)).toEqual(["Bebidas"]);
    expect(result[0]?.items.map((i) => i.name)).toEqual(["Suco de Laranja"]);
  });

  // A forma pública é montada campo a campo: campo interno novo não vaza.
  it("exposes only the public fields (no position, active or categoryId)", () => {
    const item = toPublicMenu(MENU)[0]?.items[0] as unknown as Record<
      string,
      unknown
    >;
    const category = toPublicMenu(MENU)[0] as unknown as Record<
      string,
      unknown
    >;

    expect(Object.keys(item).sort()).toEqual(
      [
        "available",
        "description",
        "id",
        "imageUrl",
        "name",
        "optionGroups",
        "priceCents",
        "sizes",
      ].sort(),
    );
    expect(Object.keys(category).sort()).toEqual(["id", "items", "name"]);
    expect(JSON.stringify(toPublicMenu(MENU))).not.toMatch(
      /"(position|active|categoryId)"/,
    );
  });

  it("ignores the base price of an item that has sizes", () => {
    const menu = structuredClone(MENU);
    const pizza = menu[0]?.items[0];
    if (!pizza) throw new Error("fixture");
    pizza.priceCents = 999;

    expect(toPublicMenu(menu)[0]?.items[0]?.priceCents).toBeNull();
  });
});

describe("parseCartItems", () => {
  const LINE = {
    itemId: 10,
    sizeId: 102,
    optionIds: [2001, 2003, 2102],
    quantity: 2,
    notes: " bem assada ",
  };

  it("parses lines, trims notes and dedupes options", () => {
    expect(
      parseCartItems({ items: [{ ...LINE, optionIds: [2001, 2001, 2003] }] }),
    ).toEqual({
      ok: true,
      value: [
        {
          itemId: 10,
          sizeId: 102,
          optionIds: [2001, 2003],
          quantity: 2,
          notes: "bem assada",
        },
      ],
    });
  });

  it("defaults: no size, no options, no notes", () => {
    expect(parseCartItems({ items: [{ itemId: 30, quantity: 1 }] })).toEqual({
      ok: true,
      value: [
        { itemId: 30, sizeId: null, optionIds: [], quantity: 1, notes: null },
      ],
    });
  });

  it("caps notes at 200 characters", () => {
    const parsed = parseCartItems({
      items: [{ ...LINE, notes: "x".repeat(500) }],
    });

    expect(parsed.ok && parsed.value[0]?.notes?.length).toBe(200);
  });

  it("tells an empty cart apart from a malformed body", () => {
    expect(parseCartItems({ items: [] })).toEqual({
      ok: false,
      error: "cart_empty",
    });
    expect(parseCartItems({})).toEqual({ ok: false, error: "items_required" });
    expect(parseCartItems(null)).toEqual({
      ok: false,
      error: "items_required",
    });
    expect(parseCartItems({ items: "x" })).toEqual({
      ok: false,
      error: "items_required",
    });
  });

  it("refuses more lines than the cap", () => {
    const items = Array.from({ length: MAX_PUBLIC_CART_LINES + 1 }, () => ({
      itemId: 30,
      quantity: 1,
    }));

    expect(parseCartItems({ items })).toEqual({
      ok: false,
      error: "too_many_lines",
    });
  });

  // O navegador é código nosso: tipo errado é adulteração, não "conveniência".
  it.each<[string, Record<string, unknown>]>([
    ["missing itemId", { quantity: 1 }],
    ["string itemId", { itemId: "10", quantity: 1 }],
    ["zero itemId", { itemId: 0, quantity: 1 }],
    ["negative itemId", { itemId: -1, quantity: 1 }],
    ["float itemId", { itemId: 1.5, quantity: 1 }],
    ["string quantity", { itemId: 1, quantity: "2" }],
    ["zero quantity", { itemId: 1, quantity: 0 }],
    ["quantity over 50", { itemId: 1, quantity: 51 }],
    ["string sizeId", { itemId: 1, quantity: 1, sizeId: "a" }],
    ["options not a list", { itemId: 1, quantity: 1, optionIds: 5 }],
    ["options with text", { itemId: 1, quantity: 1, optionIds: ["a"] }],
    [
      "too many options",
      {
        itemId: 1,
        quantity: 1,
        optionIds: Array.from({ length: 61 }, (_, i) => i + 1),
      },
    ],
  ])("rejects %s", (_name, line) => {
    expect(parseCartItems({ items: [line] })).toEqual({
      ok: false,
      error: "invalid_line",
    });
  });
});

describe("blockingProblems", () => {
  it("keeps only line problems; fulfillment/payment/minimum are for the chat", () => {
    const cart: Cart = {
      ...emptyCart(),
      items: [
        { itemId: 10, sizeId: null, optionIds: [], quantity: 1, notes: null },
      ],
    };
    const priced = priceCart(cart, MENU, null, {
      ...PRICING_SETTINGS,
      minOrderCents: 99999,
    });

    const codes = priced.problems.map((p) => p.code);
    expect(codes).toContain("fulfillment_required");
    expect(codes).toContain("payment_required");
    expect(blockingProblems(priced.problems).map((p) => p.code)).toEqual([
      "size_required",
    ]);
  });

  it("is empty for a valid cart that still lacks delivery and payment", () => {
    const cart: Cart = {
      ...emptyCart(),
      items: [
        { itemId: 30, sizeId: null, optionIds: [], quantity: 1, notes: null },
      ],
    };

    expect(
      blockingProblems(priceCart(cart, MENU, null, PRICING_SETTINGS).problems),
    ).toEqual([]);
  });
});

describe("formatMenuLinkMessage", () => {
  it("carries the exact URL and tells the customer to come back", () => {
    const text = formatMenuLinkMessage("https://loja.app/c/abc.def.ghi");

    expect(text).toContain("https://loja.app/c/abc.def.ghi");
    expect(text).toMatch(/voltar aqui/);
  });
});

describe("formatCartReceived", () => {
  function received(cart: Cart) {
    const zone = ZONES.find((z) => z.id === cart.zoneId) ?? null;
    return formatCartReceived(
      priceCart(cart, MENU, zone, PRICING_SETTINGS),
      cart,
    );
  }
  const ITEMS: Cart["items"] = [
    {
      itemId: 10,
      sizeId: 102,
      optionIds: [2001, 2003, 2102],
      quantity: 1,
      notes: null,
    },
  ];

  it("lists the cart with options and subtotal, then asks delivery or pickup", () => {
    expect(received({ ...emptyCart(), items: ITEMS })).toBe(
      [
        "Recebi seu carrinho pelo cardápio!",
        "",
        "1x Pizza Grande — R$ 68,50",
        "   Sabores: Calabresa + Quatro Queijos · Borda: Catupiry",
        "",
        "Subtotal: R$ 68,50",
        "",
        "É para entrega ou retirada?",
      ].join("\n"),
    );
  });

  it("includes item notes", () => {
    const text = received({
      ...emptyCart(),
      items: [
        {
          itemId: 30,
          sizeId: null,
          optionIds: [],
          quantity: 2,
          notes: "gelada",
        },
      ],
    });

    expect(text).toContain("2x Coca 2L — R$ 24,00");
    expect(text).toContain("Obs: gelada");
  });

  it.each<[string, Partial<Cart>, string]>([
    [
      "pickup, no payment",
      { fulfillment: "pickup" },
      "Qual a forma de pagamento?",
    ],
    [
      "delivery without address",
      { fulfillment: "delivery", address: null },
      "Qual o endereço de entrega (rua, número e bairro)?",
    ],
    [
      "everything else set",
      { fulfillment: "pickup", paymentMethod: "pix" },
      "Está tudo certo? Me diga e eu mando o resumo para você confirmar.",
    ],
  ])("next question when %s", (_name, over, question) => {
    const text = received({ ...emptyCart(), items: ITEMS, ...over });

    expect(text.endsWith(question)).toBe(true);
  });

  it("keeps what the chat already collected (delivery + payment set) and goes to the summary", () => {
    expect(
      received(readyCart()).endsWith(
        "Está tudo certo? Me diga e eu mando o resumo para você confirmar.",
      ),
    ).toBe(true);
  });
});

describe("whatsAppReturnUrl", () => {
  it("builds wa.me with the prefilled text URL-encoded", () => {
    expect(whatsAppReturnUrl("5561999990000", RETURN_TEXT)).toBe(
      `https://wa.me/5561999990000?text=${encodeURIComponent(RETURN_TEXT)}`,
    );
  });

  it("strips non-digits and returns null without a valid number", () => {
    expect(whatsAppReturnUrl("+55 61 99999-0000", "oi")).toBe(
      "https://wa.me/5561999990000?text=oi",
    );
    expect(whatsAppReturnUrl(null, "oi")).toBeNull();
    expect(whatsAppReturnUrl("", "oi")).toBeNull();
    expect(whatsAppReturnUrl("123", "oi")).toBeNull();
  });
});
