import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/db.js", () => ({
  query: vi.fn(),
}));

const db = await import("../../config/db.js");
const { findUserByEmail, findUserById } = await import("./auth.repository.js");

const query = db.query as unknown as ReturnType<typeof vi.fn>;

const ROW = {
  id: 11,
  email: "danilo@admin.com",
  password_hash: "$2b$10$hash",
  tenant_id: 4,
  tenant_slug: "pizzaria-demo",
  tenant_name: "Pizzaria Demo",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("findUserByEmail", () => {
  it("compara o e-mail em minúsculas e junta o tenant", async () => {
    query.mockResolvedValue({ rows: [ROW] });

    await expect(findUserByEmail("danilo@admin.com")).resolves.toEqual({
      id: 11,
      email: "danilo@admin.com",
      passwordHash: "$2b$10$hash",
      tenant: { id: 4, slug: "pizzaria-demo", name: "Pizzaria Demo" },
    });

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("lower(u.email) = $1");
    expect(sql).toContain("JOIN tenants t ON t.id = u.tenant_id");
    expect(query.mock.calls[0]?.[1]).toEqual(["danilo@admin.com"]);
  });

  it("devolve null para e-mail desconhecido", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(findUserByEmail("ninguem@admin.com")).resolves.toBeNull();
  });
});

describe("findUserById", () => {
  it("filtra pelo id do usuário", async () => {
    query.mockResolvedValue({ rows: [ROW] });

    await findUserById(11);

    expect(query.mock.calls[0]?.[0]).toContain("WHERE u.id = $1");
    expect(query.mock.calls[0]?.[1]).toEqual([11]);
  });
});
