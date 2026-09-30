import { beforeEach, describe, expect, it, vi } from "vitest";

const { asTenantId } = await import("../../tenants/types/tenant.types.js");
const clientQuery = vi.fn();
const query = vi.fn();
const { OrderRepository } = await import("./order.repository.js");
const { fakeTenantDb } = await import("../../../test/fakeDb.js");
const { bound } = await import("../../../test/bind.js");
const { tenantDb } = fakeTenantDb(query, clientQuery);
const repository = new OrderRepository(tenantDb);
const {
  findLastOrderForCustomer,
  findOrderById,
  insertOrder,
  listBoardOrders,
  updateOrderStatus,
} = bound(repository, [
  "findLastOrderForCustomer",
  "findOrderById",
  "insertOrder",
  "listBoardOrders",
  "updateOrderStatus",
]);

const TENANT = asTenantId(4);

const ORDER_ROW = {
  id: 10,
  number: 3,
  conversation_id: null,
  customer_name: "Ana",
  customer_phone: null,
  status: "pending",
  fulfillment: "pickup",
  address: null,
  neighborhood: null,
  payment_method: "pix",
  change_for_cents: null,
  subtotal_cents: 1800,
  fee_cents: 0,
  total_cents: 1800,
  notes: null,
  reject_reason: null,
  reject_note: null,
  created_at: new Date("2026-09-29T15:00:00.000Z"),
  accepted_at: null,
  ready_at: null,
  completed_at: null,
  updated_at: new Date("2026-09-29T15:00:00.000Z"),
};

const ITEM_ROW = {
  order_id: 10,
  name: "X-Burger",
  size_name: null,
  unit_price_cents: 1800,
  quantity: 1,
  options: [],
  notes: null,
};

const INPUT = {
  conversationId: 5,
  customerName: "Ana",
  customerPhone: null,
  fulfillment: "pickup" as const,
  address: null,
  neighborhood: null,
  paymentMethod: "pix",
  changeForCents: null,
  subtotalCents: 1800,
  feeCents: 0,
  totalCents: 1800,
  notes: null,
  items: [
    {
      name: "X-Burger",
      sizeName: null,
      unitPriceCents: 1800,
      quantity: 1,
      options: [],
      notes: null,
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  clientQuery.mockReset();
});

/** Toda query tenant-scoped: SQL cita tenant_id e o $1 é o tenant. */
function expectScoped(calls: unknown[][]) {
  for (const [sql, params] of calls) {
    if (typeof sql !== "string" || /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql))
      continue;
    expect(sql).toMatch(/tenant_id/);
    expect((params as unknown[])[0]).toBe(TENANT);
  }
}

describe("insertOrder", () => {
  it("numera pelo contador e grava pedido + itens na MESMA transação", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("order_counters")) return { rows: [{ last_number: 3 }] };
      if (sql.includes("INSERT INTO orders")) return { rows: [{ id: 10 }] };
      return { rows: [] };
    });
    query
      .mockResolvedValueOnce({ rows: [ORDER_ROW] })
      .mockResolvedValueOnce({ rows: [ITEM_ROW] });

    const order = await insertOrder(TENANT, INPUT);

    const sqls = clientQuery.mock.calls.map((c) => c[0] as string);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls[1]).toContain("order_counters");
    expect(sqls[2]).toContain("INSERT INTO orders");
    expect(sqls[3]).toContain("INSERT INTO order_items");
    expect(sqls.at(-1)).toBe("COMMIT");
    expect(clientQuery.mock.calls[2]?.[1]?.[1]).toBe(3); // number
    expectScoped(clientQuery.mock.calls);
    expect(order).toMatchObject({
      id: 10,
      number: 3,
      items: [{ name: "X-Burger" }],
    });
  });

  it("só liga a conversa se ela for do mesmo tenant", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("order_counters")) return { rows: [{ last_number: 1 }] };
      if (sql.includes("INSERT INTO orders")) return { rows: [{ id: 10 }] };
      return { rows: [] };
    });
    query.mockResolvedValue({ rows: [ORDER_ROW] });

    await insertOrder(TENANT, INPUT);

    const orderSql = clientQuery.mock.calls[2]?.[0] as string;
    expect(orderSql).toContain(
      "(SELECT id FROM conversations WHERE id = $3 AND tenant_id = $1)",
    );
  });

  it("faz ROLLBACK quando um item falha", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("order_counters")) return { rows: [{ last_number: 1 }] };
      if (sql.includes("INSERT INTO orders")) return { rows: [{ id: 10 }] };
      if (sql.includes("order_items")) throw new Error("boom");
      return { rows: [] };
    });

    await expect(insertOrder(TENANT, INPUT)).rejects.toThrow("boom");
    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
});

describe("leitura", () => {
  it("findOrderById filtra por tenant e anexa itens (também filtrados)", async () => {
    query
      .mockResolvedValueOnce({ rows: [ORDER_ROW] })
      .mockResolvedValueOnce({ rows: [ITEM_ROW] });

    const order = await findOrderById(TENANT, 10);

    expect(query.mock.calls[0]?.[0]).toContain(
      "WHERE tenant_id = $1 AND id = $2",
    );
    expect(query.mock.calls[1]?.[0]).toContain(
      "WHERE tenant_id = $1 AND order_id = ANY",
    );
    expectScoped(query.mock.calls);
    expect(order?.createdAt).toBe("2026-09-29T15:00:00.000Z");
  });

  it("findOrderById devolve null para pedido de outro tenant (0 linhas)", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(findOrderById(TENANT, 99)).resolves.toBeNull();
  });

  it("listBoardOrders traz os em andamento + encerrados desde o início do dia", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const dayStart = new Date("2026-09-29T03:00:00.000Z");

    await listBoardOrders(TENANT, dayStart);

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain(
      "status NOT IN ('completed', 'rejected', 'cancelled')",
    );
    expect(sql).toContain("created_at >= $2");
    expect(query.mock.calls[0]?.[1]).toEqual([TENANT, dayStart.toISOString()]);
  });
});

describe("updateOrderStatus", () => {
  it("só atualiza se o status ainda for o de origem e carimba a data", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 10 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ ...ORDER_ROW, status: "accepted" }] })
      .mockResolvedValueOnce({ rows: [] });

    const order = await updateOrderStatus(TENANT, 10, "pending", "accepted", {
      reason: null,
      note: null,
    });

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WHERE tenant_id = $1 AND id = $2 AND status = $3");
    expect(sql).toContain("accepted_at = CURRENT_TIMESTAMP");
    expect(query.mock.calls[0]?.[1]).toEqual([
      TENANT,
      10,
      "pending",
      "accepted",
      null,
      null,
    ]);
    expect(order?.status).toBe("accepted");
  });

  it("devolve null quando outra aba mudou o status antes (0 linhas)", async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      updateOrderStatus(TENANT, 10, "pending", "accepted", {
        reason: null,
        note: null,
      }),
    ).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("insertOrder — cliente", () => {
  function primeInsert() {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("order_counters")) return { rows: [{ last_number: 3 }] };
      if (sql.includes("INSERT INTO orders")) return { rows: [{ id: 10 }] };
      return { rows: [] };
    });
    query
      .mockResolvedValueOnce({ rows: [ORDER_ROW] })
      .mockResolvedValueOnce({ rows: [ITEM_ROW] });
  }

  it("links the order to the customer, validated against the tenant", async () => {
    primeInsert();

    await insertOrder(TENANT, { ...INPUT, customerId: 7 });

    const call = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO orders"),
    );
    expect(call?.[0]).toContain(
      "(SELECT id FROM customers WHERE id = $15 AND tenant_id = $1)",
    );
    expect((call?.[1] as unknown[])[14]).toBe(7);
  });

  it("keeps working without a customer (snapshot only)", async () => {
    primeInsert();

    await insertOrder(TENANT, INPUT);

    const call = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO orders"),
    );
    expect((call?.[1] as unknown[])[14]).toBeNull();
  });
});

describe("findLastOrderForCustomer", () => {
  it("returns the latest order that was not rejected or cancelled", async () => {
    query
      .mockResolvedValueOnce({ rows: [ORDER_ROW] })
      .mockResolvedValueOnce({ rows: [ITEM_ROW] });

    const order = await findLastOrderForCustomer(TENANT, 7);

    expect(order).toMatchObject({ number: 3, items: [{ name: "X-Burger" }] });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("customer_id = $2");
    expect(sql).toContain("status NOT IN ('rejected', 'cancelled')");
    expect(sql).toContain("ORDER BY created_at DESC");
    expect(params).toEqual([TENANT, 7]);
    expectScoped(query.mock.calls);
  });

  it("returns null when the customer never ordered", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(findLastOrderForCustomer(TENANT, 7)).resolves.toBeNull();
  });
});
