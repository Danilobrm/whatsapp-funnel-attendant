import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyCart } from "../types/cart.types.js";
import { readyCart } from "../utils/fixtures.test-util.js";

vi.mock("../../../config/db.js", () => ({ query: vi.fn() }));

const db = await import("../../../config/db.js");
const { claimConfirmedCart, deleteCart, findCart, saveCart } =
  await import("./cart.repository.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const query = db.query as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(4);

beforeEach(() => {
  vi.resetAllMocks();
});

function expectScoped() {
  for (const [sql, params] of query.mock.calls) {
    expect(sql).toMatch(/tenant_id/);
    expect((params as unknown[])[0]).toBe(TENANT);
  }
}

describe("findCart", () => {
  it("maps the row to a Cart", async () => {
    query.mockResolvedValue({
      rows: [
        {
          items: [
            {
              itemId: 30,
              sizeId: null,
              optionIds: [],
              quantity: 2,
              notes: null,
            },
          ],
          fulfillment: "pickup",
          address: null,
          zone_id: null,
          payment_method: "cash",
          change_for_cents: 5000,
          notes: "sem gelo",
          status: "awaiting_confirmation",
          summary_hash: "abc",
          updated_at: new Date("2026-09-29T15:00:00.000Z"),
        },
      ],
    });

    const cart = await findCart(TENANT, 9);

    expect(cart).toEqual({
      items: [
        { itemId: 30, sizeId: null, optionIds: [], quantity: 2, notes: null },
      ],
      fulfillment: "pickup",
      address: null,
      zoneId: null,
      paymentMethod: "cash",
      changeForCents: 5000,
      notes: "sem gelo",
      status: "awaiting_confirmation",
      summaryHash: "abc",
      updatedAt: "2026-09-29T15:00:00.000Z",
    });
    expect(query.mock.calls[0]?.[1]).toEqual([TENANT, 9]);
    expectScoped();
  });

  it("returns null when the conversation has no cart", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(findCart(TENANT, 9)).resolves.toBeNull();
  });
});

describe("saveCart", () => {
  it("upserts the whole cart, with JSON columns serialized", async () => {
    query.mockResolvedValue({ rowCount: 1 });
    const cart = readyCart();

    await saveCart(TENANT, 9, cart);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT (conversation_id) DO UPDATE");
    expect(params[0]).toBe(TENANT);
    expect(params[1]).toBe(9);
    expect(params[2]).toBe(JSON.stringify(cart.items));
    expect(params[4]).toBe(JSON.stringify(cart.address));
    expect(params[5]).toBe(1); // zone
    expectScoped();
  });

  // Conversa de outro tenant vira no-op: nem cria carrinho, nem sobrescreve o alheio.
  it("cannot write a cart onto a conversation of another tenant", async () => {
    query.mockResolvedValue({ rowCount: 0 });

    await saveCart(TENANT, 9, emptyCart());

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain(
      "WHERE EXISTS (SELECT 1 FROM conversations WHERE id = $2 AND tenant_id = $1)",
    );
    expect(sql).toContain("WHERE carts.tenant_id = EXCLUDED.tenant_id");
  });

  it("stores a null address as SQL NULL, not the string 'null'", async () => {
    query.mockResolvedValue({ rowCount: 1 });

    await saveCart(TENANT, 9, emptyCart());

    expect((query.mock.calls[0]?.[1] as unknown[])[4]).toBeNull();
  });
});

describe("deleteCart", () => {
  it("deletes by tenant and conversation", async () => {
    query.mockResolvedValue({ rowCount: 1 });

    await deleteCart(TENANT, 9);

    expect(query.mock.calls[0]?.[1]).toEqual([TENANT, 9]);
    expectScoped();
  });
});

describe("claimConfirmedCart", () => {
  it("only claims a cart that is awaiting confirmation with THAT summary hash", async () => {
    query.mockResolvedValue({ rowCount: 1 });

    await expect(claimConfirmedCart(TENANT, 9, "hash1")).resolves.toBe(true);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'awaiting_confirmation'");
    expect(sql).toContain("summary_hash = $3");
    expect(params).toEqual([TENANT, 9, "hash1"]);
    expectScoped();
  });

  it("returns false when nothing matched (already claimed, changed or expired)", async () => {
    query.mockResolvedValue({ rowCount: 0 });

    await expect(claimConfirmedCart(TENANT, 9, "hash1")).resolves.toBe(false);
  });
});
