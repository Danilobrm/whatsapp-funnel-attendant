import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/db.js", () => ({
  query: vi.fn(),
}));

const db = await import("../../config/db.js");
const {
  deleteConversation,
  findMessagesByContact,
  findRecentMessages,
  insertMessage,
  upsertConversation,
} = await import("./conversation.repository.js");
const { asTenantId } = await import("../tenants/tenant.types.js");

const query = db.query as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(4);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("upsertConversation", () => {
  it("returns the previous last_message_at read before the upsert", async () => {
    query.mockResolvedValue({
      rows: [{ id: 9, previous_message_at: "2026-09-28T10:00:00.000Z" }],
    });

    const ref = await upsertConversation(TENANT, "whatsapp", "5511", "Maria");

    expect(ref).toEqual({
      id: 9,
      previousMessageAt: new Date("2026-09-28T10:00:00.000Z"),
    });
    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WITH prev AS");
    expect(sql).toContain("ON CONFLICT (tenant_id, channel, contact)");
    expect(query.mock.calls[0]?.[1]).toEqual([
      TENANT,
      "whatsapp",
      "5511",
      "Maria",
    ]);
  });

  it("reports a brand-new conversation as previousMessageAt null", async () => {
    query.mockResolvedValue({ rows: [{ id: 1, previous_message_at: null }] });

    await expect(
      upsertConversation(TENANT, "simulator", "admin-1", null),
    ).resolves.toEqual({ id: 1, previousMessageAt: null });
  });
});

describe("insertMessage", () => {
  it("reports true when the row was inserted", async () => {
    query.mockResolvedValue({ rows: [{ id: "1" }], rowCount: 1 });

    await expect(
      insertMessage(TENANT, 9, "inbound", "oi", "wamid.1"),
    ).resolves.toBe(true);
  });

  // Reenvio da Meta: mesmo wamid, nada inserido → quem chama não responde.
  it("reports false on a duplicated external id", async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(
      insertMessage(TENANT, 9, "inbound", "oi", "wamid.1"),
    ).resolves.toBe(false);
    expect(query.mock.calls[0]?.[0]).toContain("DO NOTHING");
  });

  it("scopes the conversation to the tenant", async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    await insertMessage(TENANT, 9, "outbound", "olá", null);

    expect(query.mock.calls[0]?.[0]).toContain(
      "EXISTS (SELECT 1 FROM conversations WHERE id = $2 AND tenant_id = $1)",
    );
    expect(query.mock.calls[0]?.[1]).toEqual([
      TENANT,
      9,
      "outbound",
      "olá",
      null,
    ]);
  });
});

describe("findRecentMessages", () => {
  it("filters by tenant and maps dates to ISO strings", async () => {
    query.mockResolvedValue({
      rows: [
        {
          direction: "inbound",
          body: "oi",
          created_at: new Date("2026-09-28T10:00:00.000Z"),
        },
      ],
    });

    await expect(findRecentMessages(TENANT, 9, 20)).resolves.toEqual([
      {
        direction: "inbound",
        body: "oi",
        createdAt: "2026-09-28T10:00:00.000Z",
      },
    ]);
    expect(query.mock.calls[0]?.[0]).toContain("WHERE tenant_id = $1");
    expect(query.mock.calls[0]?.[1]).toEqual([TENANT, 9, 20]);
  });
});

describe("findMessagesByContact", () => {
  it("returns empty without a conversation", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(
      findMessagesByContact(TENANT, "simulator", "admin-1", 50),
    ).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("deleteConversation", () => {
  it("deletes only the tenant's conversation for that contact", async () => {
    query.mockResolvedValue({ rows: [], rowCount: 1 });

    await deleteConversation(TENANT, "simulator", "admin-1");

    expect(query.mock.calls[0]?.[0]).toContain("tenant_id = $1");
    expect(query.mock.calls[0]?.[1]).toEqual([TENANT, "simulator", "admin-1"]);
  });
});
