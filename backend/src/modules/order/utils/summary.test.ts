import { describe, expect, it } from "vitest";

import { priceCart } from "./pricing.js";
import { formatOrderPlaced, formatOrderSummary } from "./summary.js";
import {
  MENU,
  PRICING_SETTINGS,
  readyCart,
  ZONES,
} from "./fixtures.test-util.js";

import type { Cart } from "../types/cart.types.js";

function summaryOf(cart: Cart): string {
  const zone = ZONES.find((z) => z.id === cart.zoneId) ?? null;
  return formatOrderSummary(
    priceCart(cart, MENU, zone, PRICING_SETTINGS),
    cart,
  );
}

// Aqui snapshot é aceitável: o texto é o contrato com o cliente.
describe("formatOrderSummary", () => {
  it("renders half-and-half pizza with border, delivery and Pix", () => {
    expect(summaryOf(readyCart())).toBe(
      [
        "Resumo do seu pedido:",
        "",
        "1x Pizza Grande — R$ 68,50",
        "   Sabores: Calabresa + Quatro Queijos · Borda: Catupiry",
        "",
        "Subtotal: R$ 68,50",
        "Taxa de entrega: R$ 5,00",
        "Total: R$ 73,50",
        "",
        "Entrega em: Rua das Flores, 12 - Centro",
        "Pagamento: Pix",
        "",
        "Posso confirmar?",
      ].join("\n"),
    );
  });

  it("renders pickup without fee lines and cash with change", () => {
    const text = summaryOf(
      readyCart({
        fulfillment: "pickup",
        address: null,
        zoneId: null,
        paymentMethod: "cash",
        changeForCents: 10000,
        items: [
          {
            itemId: 20,
            sizeId: null,
            optionIds: [2201],
            quantity: 2,
            notes: "sem cebola",
          },
          { itemId: 30, sizeId: null, optionIds: [], quantity: 1, notes: null },
        ],
      }),
    );

    expect(text).toBe(
      [
        "Resumo do seu pedido:",
        "",
        "2x X-Burger — R$ 44,00",
        "   Adicionais: Bacon",
        "   Obs: sem cebola",
        "1x Coca 2L — R$ 12,00",
        "",
        "Subtotal: R$ 56,00",
        "Total: R$ 56,00",
        "",
        "Retirada no balcão",
        "Pagamento: Dinheiro (troco para R$ 100,00)",
        "",
        "Posso confirmar?",
      ].join("\n"),
    );
  });

  it("says 'sem troco' for cash without change and shows the order note and reference", () => {
    const text = summaryOf(
      readyCart({
        paymentMethod: "cash",
        changeForCents: null,
        notes: "tocar a campainha",
        address: {
          street: "Rua 7",
          number: null,
          complement: "ap 3",
          reference: "perto da praça",
          neighborhood: "Centro",
        },
      }),
    );

    expect(text).toContain("Pagamento: Dinheiro (sem troco)");
    expect(text).toContain("Obs. do pedido: tocar a campainha");
    expect(text).toContain(
      "Entrega em: Rua 7 - ap 3 - Centro (ref.: perto da praça)",
    );
  });

  it("always ends asking for confirmation", () => {
    expect(summaryOf(readyCart()).endsWith("Posso confirmar?")).toBe(true);
  });
});

describe("formatOrderPlaced", () => {
  it("says the order was RECEIVED (still pending), with total and estimate", () => {
    expect(
      formatOrderPlaced(
        { number: 42, totalCents: 7350, paymentMethod: "cash" },
        40,
        null,
      ),
    ).toBe(
      "Pedido #42 recebido! Total: R$ 73,50.\nAssim que a loja confirmar, avisamos por aqui. Tempo estimado: 40 min.",
    );
  });

  it("includes the Pix key only for Pix orders", () => {
    const pix = formatOrderPlaced(
      { number: 1, totalCents: 1000, paymentMethod: "pix" },
      30,
      "chave@pix.com",
    );
    const cash = formatOrderPlaced(
      { number: 1, totalCents: 1000, paymentMethod: "cash" },
      30,
      "chave@pix.com",
    );

    expect(pix).toContain("chave@pix.com");
    expect(cash).not.toContain("chave@pix.com");
  });
});
