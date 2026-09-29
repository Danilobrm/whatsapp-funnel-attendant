import { beforeEach, describe, expect, it, vi } from "vitest";

const clientQuery = vi.fn();
const client = { query: clientQuery, release: vi.fn() };

vi.mock("../../../config/db.js", () => ({
  query: vi.fn(),
  pool: { connect: vi.fn(async () => client) },
}));

const db = await import("../../../config/db.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");
const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  deleteItem,
  updateItemAvailability,
} = await import("./menu.repository.js");

const query = db.query as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(6);

beforeEach(() => {
  vi.resetAllMocks();
  clientQuery.mockReset();
});

describe("categorias", () => {
  it("listCategories filtra por tenant_id", async () => {
    query.mockResolvedValue({ rows: [] });
    await listCategories(TENANT);

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WHERE tenant_id = $1");
    expect(query.mock.calls[0]?.[1]).toEqual([TENANT]);
  });

  it("createCategory grava tenant_id como primeiro parâmetro", async () => {
    query.mockResolvedValue({
      rows: [{ id: 1, name: "Pizzas", position: 0, active: true }],
    });

    await createCategory(TENANT, { name: "Pizzas", position: 0, active: true });

    expect(query.mock.calls[0]?.[1]?.[0]).toBe(TENANT);
  });

  it("updateCategory escopa por tenant_id E id, devolve null se não achar", async () => {
    query.mockResolvedValue({ rows: [] });

    const result = await updateCategory(TENANT, 999, {
      name: "Pizzas",
      position: 0,
      active: true,
    });

    expect(result).toBeNull();
    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WHERE tenant_id = $1 AND id = $2");
  });

  it("deleteCategory devolve false sem afetar linha de outro tenant", async () => {
    query.mockResolvedValue({ rowCount: 0 });

    await expect(deleteCategory(TENANT, 999)).resolves.toBe(false);
    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WHERE tenant_id = $1 AND id = $2");
  });
});

describe("itens", () => {
  it("deleteItem escopa por tenant_id E id", async () => {
    query.mockResolvedValue({ rowCount: 1 });

    await deleteItem(TENANT, 1);

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WHERE tenant_id = $1 AND id = $2");
    expect(query.mock.calls[0]?.[1]).toEqual([TENANT, 1]);
  });

  it("updateItemAvailability escopa por tenant_id E id", async () => {
    query.mockResolvedValue({ rowCount: 1 });

    await updateItemAvailability(TENANT, 1, false);

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WHERE tenant_id = $1 AND id = $2");
    expect(query.mock.calls[0]?.[1]).toEqual([TENANT, 1, false]);
  });
});
