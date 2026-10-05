import { beforeEach, describe, expect, it, vi } from "vitest";

import { CART_TTL_MS } from "../types/cart.types.js";
import { readyCart } from "../utils/fixtures.test-util.js";

const repo = { findCart: vi.fn(), saveCart: vi.fn(), deleteCart: vi.fn() };
const { CartService } = await import("./cart.service.js");
const cartService = new CartService(repo as never);
const getCart = cartService.getCart.bind(cartService);
const saveEditedCart = cartService.saveEditedCart.bind(cartService);
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const findCart = repo.findCart as unknown as ReturnType<typeof vi.fn>;
const saveCart = repo.saveCart as unknown as ReturnType<typeof vi.fn>;
const deleteCart = repo.deleteCart as unknown as ReturnType<typeof vi.fn>;

const TENANT = asTenantId(4);
const NOW = new Date("2026-09-29T15:00:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getCart", () => {
  it("returns an empty cart when there is none", async () => {
    findCart.mockResolvedValue(null);

    const cart = await getCart(TENANT, 9, NOW);

    expect(cart.items).toEqual([]);
    expect(deleteCart).not.toHaveBeenCalled();
  });

  it("returns a fresh cart as stored", async () => {
    const stored = readyCart({
      updatedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    });
    findCart.mockResolvedValue(stored);

    await expect(getCart(TENANT, 9, NOW)).resolves.toBe(stored);
  });

  // Sem job: quem volta no dia seguinte começa do zero, e o lixo sai na leitura.
  it("discards a cart idle for more than 3h and starts from empty", async () => {
    findCart.mockResolvedValue(
      readyCart({
        updatedAt: new Date(NOW.getTime() - CART_TTL_MS - 1).toISOString(),
      }),
    );

    const cart = await getCart(TENANT, 9, NOW);

    expect(cart.items).toEqual([]);
    expect(deleteCart).toHaveBeenCalledWith(TENANT, 9);
  });
});

describe("saveEditedCart", () => {
  it("reopens the cart and drops the summary — the customer confirms only what they saw", async () => {
    const confirmed = readyCart({
      status: "awaiting_confirmation",
      summaryHash: "abc",
    });

    const saved = await saveEditedCart(TENANT, 9, confirmed);

    expect(saved).toMatchObject({ status: "open", summaryHash: null });
    expect(saveCart).toHaveBeenCalledWith(TENANT, 9, saved);
  });
});
