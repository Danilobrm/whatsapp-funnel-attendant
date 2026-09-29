import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../config/db.js", () => ({
  query: vi.fn(),
}));

const db = await import("../../../config/db.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");
const { breakdown, countActive, dailyTotals, topItems } =
  await import("./dashboard.repository.js");

const query = db.query as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(8);
const SINCE = new Date("2026-09-23T03:00:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
});

function lastCall(): [string, unknown[]] {
  const call = query.mock.calls.at(-1);
  return [call?.[0] as string, call?.[1] as unknown[]];
}

describe("dashboard.repository", () => {
  it("dailyTotals agrupa pelo dia no fuso da loja e só conta válidos", async () => {
    query.mockResolvedValue({
      rows: [
        {
          day: "2026-09-29",
          orders: "3",
          revenue_cents: "9000",
          rejected: "1",
        },
      ],
    });

    const rows = await dailyTotals(TENANT, SINCE, "America/Sao_Paulo");

    const [sql, params] = lastCall();
    expect(sql).toContain("created_at AT TIME ZONE $3");
    expect(sql).toContain("WHERE tenant_id = $1 AND created_at >= $2");
    expect(sql).toContain("status NOT IN ('rejected', 'cancelled')");
    expect(params).toEqual([TENANT, SINCE.toISOString(), "America/Sao_Paulo"]);
    // bigint/numeric do pg chegam como string → número.
    expect(rows).toEqual([
      { day: "2026-09-29", orders: 3, revenueCents: 9000, rejected: 1 },
    ]);
  });

  it("dailyTotals trata SUM nulo (dia só com recusados) como zero", async () => {
    query.mockResolvedValue({
      rows: [
        { day: "2026-09-29", orders: "0", revenue_cents: null, rejected: "2" },
      ],
    });
    const [row] = await dailyTotals(TENANT, SINCE, "UTC");
    expect(row?.revenueCents).toBe(0);
  });

  it("topItems filtra os DOIS lados do join por tenant e limita", async () => {
    query.mockResolvedValue({
      rows: [{ name: "X-Tudo", quantity: "4", revenue_cents: "10000" }],
    });

    const items = await topItems(TENANT, SINCE, 5);

    const [sql, params] = lastCall();
    expect(sql).toContain("i.tenant_id = $1 AND o.tenant_id = $1");
    expect(sql).toContain("o.status NOT IN ('rejected', 'cancelled')");
    expect(params).toEqual([TENANT, SINCE.toISOString(), 5]);
    expect(items).toEqual([
      { name: "X-Tudo", quantity: 4, revenueCents: 10000 },
    ]);
  });

  it.each(["fulfillment", "payment_method"] as const)(
    "breakdown por %s conta válidos do tenant",
    async (column) => {
      query.mockResolvedValue({ rows: [{ key: "pix", count: "2" }] });

      const entries = await breakdown(TENANT, SINCE, column);

      const [sql, params] = lastCall();
      expect(sql).toContain(`${column}::text AS key`);
      expect(sql).toContain("WHERE tenant_id = $1");
      expect(params).toEqual([TENANT, SINCE.toISOString()]);
      expect(entries).toEqual([{ key: "pix", count: 2 }]);
    },
  );

  it("countActive conta só status em andamento", async () => {
    query.mockResolvedValue({ rows: [{ count: "3" }] });

    await expect(countActive(TENANT)).resolves.toBe(3);
    const [sql, params] = lastCall();
    expect(sql).toContain(
      "'pending', 'accepted', 'out_for_delivery', 'ready_for_pickup'",
    );
    expect(params).toEqual([TENANT]);
  });
});
