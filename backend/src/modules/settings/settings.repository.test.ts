import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/db.js", () => ({
  query: vi.fn(),
}));

const db = await import("../../config/db.js");
const { asTenantId } = await import("../tenants/tenant.types.js");
const { findBotSettings, saveBotSettings } =
  await import("./settings.repository.js");

const query = db.query as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(7);

const ROW = {
  name: "Nina",
  personality: "friendly",
  gender: "female",
  languages: ["pt-BR"],
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("findBotSettings", () => {
  it("busca a linha do tenant, não a linha id = 1", async () => {
    query.mockResolvedValue({ rows: [ROW] });

    await expect(findBotSettings(TENANT)).resolves.toMatchObject({
      name: "Nina",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WHERE tenant_id = $1");
    expect(sql).not.toContain("id = 1");
    expect(query.mock.calls[0]?.[1]).toEqual([TENANT]);
  });

  it("devolve null quando o tenant ainda não personalizou nada", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(findBotSettings(TENANT)).resolves.toBeNull();
  });
});

describe("saveBotSettings", () => {
  it("faz upsert com conflito em tenant_id", async () => {
    query.mockResolvedValue({ rows: [ROW] });

    await saveBotSettings(TENANT, {
      name: "Nina",
      personality: "friendly",
      gender: "female",
      languages: ["pt-BR"],
    });

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("ON CONFLICT (tenant_id) DO UPDATE");
    expect(query.mock.calls[0]?.[1]?.[0]).toBe(TENANT);
  });

  it("falha alto se o upsert não devolver linha", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(
      saveBotSettings(TENANT, {
        name: "Nina",
        personality: "friendly",
        gender: "female",
        languages: ["pt-BR"],
      }),
    ).rejects.toThrow(/Falha ao salvar/);
  });
});
