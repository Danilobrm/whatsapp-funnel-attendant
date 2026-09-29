import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../config/db.js", () => ({ query: vi.fn() }));

const db = await import("../../../config/db.js");
const {
  countMenuFunnel,
  deleteStaleMenuLinks,
  findActiveMenuLink,
  findMenuLinkByCode,
  insertMenuLink,
  insertMenuLinkEvent,
  insertMenuLinkOrdered,
} = await import("./menuLink.repository.js");
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

describe("insertMenuLinkEvent", () => {
  it("inserts the event only when the conversation belongs to the tenant", async () => {
    query.mockResolvedValue({ rowCount: 1 });

    await insertMenuLinkEvent(TENANT, 9, "opened");

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      "WHERE EXISTS (SELECT 1 FROM conversations WHERE id = $2 AND tenant_id = $1)",
    );
    expect(params).toEqual([TENANT, 9, "opened"]);
    expectScoped();
  });
});

describe("insertMenuLinkOrdered", () => {
  // Pedido digitado no chat não entra no funil do cardápio.
  it("records 'ordered' only for a conversation that already has a 'confirmed'", async () => {
    query.mockResolvedValue({ rowCount: 0 });

    await insertMenuLinkOrdered(TENANT, 9);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("event = 'confirmed'");
    expect(sql).toContain("'ordered'");
    expect(sql).toMatch(/WHERE EXISTS \(\s*SELECT 1 FROM menu_link_events/);
    expect(params).toEqual([TENANT, 9]);
    expectScoped();
  });
});

describe("countMenuFunnel", () => {
  it("counts DISTINCT conversations per step, scoped and windowed", async () => {
    query.mockResolvedValue({
      rows: [
        { event: "sent", total: "10" },
        { event: "opened", total: "7" },
        { event: "confirmed", total: "5" },
        { event: "ordered", total: "4" },
      ],
    });
    const since = new Date("2026-09-23T03:00:00.000Z");

    const funnel = await countMenuFunnel(TENANT, since);

    expect(funnel).toEqual({ sent: 10, opened: 7, confirmed: 5, ordered: 4 });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("COUNT(DISTINCT conversation_id)");
    expect(sql).toContain("created_at >= $2");
    expect(params).toEqual([TENANT, since.toISOString()]);
    expectScoped();
  });

  it("returns zeros for steps with no events, and ignores unknown events", async () => {
    query.mockResolvedValue({
      rows: [
        { event: "sent", total: "2" },
        { event: "weird", total: "9" },
      ],
    });

    await expect(countMenuFunnel(TENANT, new Date())).resolves.toEqual({
      sent: 2,
      opened: 0,
      confirmed: 0,
      ordered: 0,
    });
  });
});

const LINK_ROW = {
  code: "k7Xp2mQ9aBcD",
  tenant_id: 4,
  conversation_id: 9,
  expires_at: new Date("2026-09-29T20:00:00.000Z"),
};

describe("findActiveMenuLink", () => {
  it("returns the newest unexpired link of the conversation, scoped to the tenant", async () => {
    query.mockResolvedValue({ rows: [LINK_ROW] });

    await expect(findActiveMenuLink(TENANT, 9)).resolves.toEqual({
      code: "k7Xp2mQ9aBcD",
      tenantId: 4,
      conversationId: 9,
      expiresAt: new Date("2026-09-29T20:00:00.000Z"),
    });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("expires_at > NOW()");
    expect(sql).toContain("ORDER BY expires_at DESC");
    expect(params).toEqual([TENANT, 9]);
    expectScoped();
  });

  it("is null when there is none, and parses a string date", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(findActiveMenuLink(TENANT, 9)).resolves.toBeNull();

    query.mockResolvedValueOnce({
      rows: [{ ...LINK_ROW, expires_at: "2026-09-29T20:00:00.000Z" }],
    });
    expect((await findActiveMenuLink(TENANT, 9))?.expiresAt).toEqual(
      new Date("2026-09-29T20:00:00.000Z"),
    );
  });
});

describe("insertMenuLink", () => {
  it("stores the code only for a conversation of the tenant, ignoring code collisions", async () => {
    query.mockResolvedValue({ rowCount: 1 });
    const expires = new Date("2026-09-29T20:00:00.000Z");

    await expect(
      insertMenuLink(TENANT, 9, "k7Xp2mQ9aBcD", expires),
    ).resolves.toBe(true);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      "WHERE EXISTS (SELECT 1 FROM conversations WHERE id = $3 AND tenant_id = $1)",
    );
    expect(sql).toContain("ON CONFLICT (code) DO NOTHING");
    expect(params).toEqual([TENANT, "k7Xp2mQ9aBcD", 9, expires.toISOString()]);
    expectScoped();
  });

  it("returns false on a collision or a foreign conversation (nothing inserted)", async () => {
    query.mockResolvedValue({ rowCount: 0 });

    await expect(insertMenuLink(TENANT, 9, "x", new Date())).resolves.toBe(
      false,
    );
  });
});

describe("deleteStaleMenuLinks", () => {
  it("only deletes links expired for over a day, of this tenant", async () => {
    query.mockResolvedValue({ rowCount: 3 });

    await deleteStaleMenuLinks(TENANT);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("expires_at < NOW() - INTERVAL '1 day'");
    expect(params).toEqual([TENANT]);
    expectScoped();
  });
});

describe("findMenuLinkByCode", () => {
  // Exceção deliberada: é a consulta que DESCOBRE o tenant a partir do código.
  it("looks up by code alone and returns the tenant from the row", async () => {
    query.mockResolvedValue({ rows: [LINK_ROW] });

    const link = await findMenuLinkByCode("k7Xp2mQ9aBcD");

    expect(link).toMatchObject({ tenantId: 4, conversationId: 9 });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("WHERE code = $1");
    expect(params).toEqual(["k7Xp2mQ9aBcD"]);
  });

  it("is null for an unknown code", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(findMenuLinkByCode("nopeNopeNope")).resolves.toBeNull();
  });
});
