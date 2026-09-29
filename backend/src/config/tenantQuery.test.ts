import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", () => ({
  query: vi.fn(),
}));

const db = await import("./db.js");
const { asTenantId } = await import("../modules/tenants/types/tenant.types.js");
const { assertTenantScoped, tenantQuery } = await import("./tenantQuery.js");

const query = db.query as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(7);
const OTHER_TENANT = asTenantId(9);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("assertTenantScoped", () => {
  it("passa quando o SQL referencia tenant_id e o primeiro parâmetro bate", () => {
    expect(() =>
      assertTenantScoped(TENANT, "SELECT * FROM x WHERE tenant_id = $1", [
        TENANT,
      ]),
    ).not.toThrow();
  });

  it("é case-insensitive para o nome da coluna", () => {
    expect(() =>
      assertTenantScoped(TENANT, "SELECT * FROM x WHERE TENANT_ID = $1", [
        TENANT,
      ]),
    ).not.toThrow();
  });

  it("lança quando o SQL não menciona tenant_id", () => {
    expect(() =>
      assertTenantScoped(TENANT, "SELECT * FROM x WHERE id = $1", [TENANT]),
    ).toThrow(/não referencia tenant_id/);
  });

  it("lança quando o primeiro parâmetro não é o tenantId da chamada", () => {
    expect(() =>
      assertTenantScoped(TENANT, "SELECT * FROM x WHERE tenant_id = $1", [
        OTHER_TENANT,
      ]),
    ).toThrow(/primeiro parâmetro vinculado/);
  });

  it("lança quando o tenantId nem foi passado como parâmetro", () => {
    expect(() =>
      assertTenantScoped(TENANT, "SELECT * FROM x WHERE tenant_id = $1", []),
    ).toThrow(/primeiro parâmetro vinculado/);
  });

  it("lança quando o primeiro parâmetro é um id de outra entidade por engano", () => {
    // Bug clássico: passar conversationId no lugar de tenantId.
    const conversationId = 42;
    expect(() =>
      assertTenantScoped(TENANT, "SELECT * FROM x WHERE tenant_id = $1", [
        conversationId,
      ]),
    ).toThrow(/primeiro parâmetro vinculado/);
  });
});

describe("tenantQuery", () => {
  it("delega para query() quando a validação passa", async () => {
    query.mockResolvedValue({ rows: [] });

    await tenantQuery(TENANT, "SELECT * FROM x WHERE tenant_id = $1", [TENANT]);

    expect(query).toHaveBeenCalledWith("SELECT * FROM x WHERE tenant_id = $1", [
      TENANT,
    ]);
  });

  it("nunca chega a chamar query() quando a validação falha", async () => {
    await expect(
      tenantQuery(TENANT, "SELECT * FROM x WHERE id = $1", [TENANT]),
    ).rejects.toThrow(/não referencia tenant_id/);

    expect(query).not.toHaveBeenCalled();
  });

  it("nunca chega a chamar query() com o tenantId errado", async () => {
    await expect(
      tenantQuery(TENANT, "SELECT * FROM x WHERE tenant_id = $1", [
        OTHER_TENANT,
      ]),
    ).rejects.toThrow(/primeiro parâmetro vinculado/);

    expect(query).not.toHaveBeenCalled();
  });
});
