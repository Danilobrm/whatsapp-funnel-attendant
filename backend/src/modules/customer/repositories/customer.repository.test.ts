import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../config/db.js", () => ({ query: vi.fn() }));

const db = await import("../../../config/db.js");
const { listSimulatedCustomers, updateCustomerLastAddress, upsertCustomer } =
  await import("./customer.repository.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const query = db.query as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(4);

beforeEach(() => {
  vi.resetAllMocks();
});

/** Toda query tenant-scoped: SQL cita tenant_id e o $1 é o tenant. */
function expectScoped() {
  for (const [sql, params] of query.mock.calls) {
    expect(sql).toMatch(/tenant_id/);
    expect((params as unknown[])[0]).toBe(TENANT);
  }
}

describe("upsertCustomer", () => {
  it("upserts by (tenant, phone) and maps the row", async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: 3,
          phone: "5561990000001",
          name: "Ana",
          last_address: {
            street: "Rua 7",
            number: "1",
            complement: null,
            reference: null,
            neighborhood: "Centro",
          },
        },
      ],
    });

    const customer = await upsertCustomer(TENANT, "5561990000001", "Ana");

    expect(customer).toEqual({
      id: 3,
      phone: "5561990000001",
      name: "Ana",
      lastAddress: {
        street: "Rua 7",
        number: "1",
        complement: null,
        reference: null,
        neighborhood: "Centro",
      },
    });
    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("ON CONFLICT (tenant_id, phone)");
    expect(query.mock.calls[0]?.[1]).toEqual([TENANT, "5561990000001", "Ana"]);
    expectScoped();
  });

  // Uma mensagem sem nome de perfil não pode apagar o nome que já se sabe.
  it("never overwrites a known name with an empty one", async () => {
    query.mockResolvedValue({
      rows: [{ id: 3, phone: "1", name: "Ana", last_address: null }],
    });

    await upsertCustomer(TENANT, "1", null);

    expect(query.mock.calls[0]?.[0]).toContain(
      "COALESCE(EXCLUDED.name, customers.name)",
    );
  });

  it("throws when the row does not come back", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(upsertCustomer(TENANT, "1", null)).rejects.toThrow();
  });
});

describe("updateCustomerLastAddress", () => {
  it("stores the address as JSON, scoped to the tenant", async () => {
    query.mockResolvedValue({ rowCount: 1 });
    const address = {
      street: "Rua 7",
      number: "1",
      complement: null,
      reference: null,
      neighborhood: "Centro",
    };

    await updateCustomerLastAddress(TENANT, 3, address);

    expect(query.mock.calls[0]?.[1]).toEqual([
      TENANT,
      3,
      JSON.stringify(address),
    ]);
    expect(query.mock.calls[0]?.[0]).toMatch(
      /WHERE tenant_id = \$1 AND id = \$2/,
    );
    expectScoped();
  });
});

describe("listSimulatedCustomers", () => {
  it("lists only customers that have a simulator conversation", async () => {
    query.mockResolvedValue({
      rows: [
        { id: 1, phone: "5561990000009", name: "Teste", last_address: null },
      ],
    });

    const list = await listSimulatedCustomers(TENANT);

    expect(list).toEqual([
      { id: 1, phone: "5561990000009", name: "Teste", lastAddress: null },
    ]);
    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("c.channel = 'simulator'");
    expect(sql).toContain("c.tenant_id = cu.tenant_id");
    expectScoped();
  });
});
