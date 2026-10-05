import { describe, expect, it } from "vitest";

import { CART_TTL_MS, emptyCart, isCartExpired } from "./cart.types.js";

const NOW = new Date("2026-09-29T15:00:00.000Z");

describe("isCartExpired", () => {
  it("is false for a cart never saved", () => {
    expect(isCartExpired(null, NOW)).toBe(false);
  });

  it("keeps a cart touched within 3h", () => {
    const at = new Date(NOW.getTime() - CART_TTL_MS + 60_000).toISOString();
    expect(isCartExpired(at, NOW)).toBe(false);
  });

  it("drops a cart idle for more than 3h", () => {
    const at = new Date(NOW.getTime() - CART_TTL_MS - 1).toISOString();
    expect(isCartExpired(at, NOW)).toBe(true);
  });
});

describe("emptyCart", () => {
  it("starts open, empty and without a summary", () => {
    expect(emptyCart()).toMatchObject({
      items: [],
      fulfillment: null,
      status: "open",
      summaryHash: null,
    });
  });

  it("returns a fresh object each time", () => {
    expect(emptyCart()).not.toBe(emptyCart());
    expect(emptyCart().items).not.toBe(emptyCart().items);
  });
});
