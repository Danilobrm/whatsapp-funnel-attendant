import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/db.js", () => ({
  query: vi.fn(),
}));

const db = await import("../../config/db.js");
const { asTenantId } = await import("../tenants/tenant.types.js");
const {
  findStoreSettings,
  saveStoreSettings,
  listDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
} = await import("./store.repository.js");

const query = db.query as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(5);

const SETTINGS_ROW = {
  timezone: "America/Sao_Paulo",
  opening_hours: { mon: [["11:00", "15:00"]] },
  paused: false,
  min_order_cents: 0,
  estimated_minutes: 40,
  pickup_enabled: true,
  delivery_enabled: true,
  payment_methods: ["pix", "cash"],
  pix_key: null,
  owner_whatsapp: null,
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("findStoreSettings", () => {
  it("filtra por tenant_id", async () => {
    query.mockResolvedValue({ rows: [SETTINGS_ROW] });

    await findStoreSettings(TENANT);

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WHERE tenant_id = $1");
    expect(query.mock.calls[0]?.[1]).toEqual([TENANT]);
  });

  it("devolve null sem linha", async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(findStoreSettings(TENANT)).resolves.toBeNull();
  });
});

describe("saveStoreSettings", () => {
  it("upsert com conflito em tenant_id, tenant_id como primeiro parâmetro", async () => {
    query.mockResolvedValue({ rows: [SETTINGS_ROW] });

    await saveStoreSettings(TENANT, {
      timezone: "America/Sao_Paulo",
      openingHours: { mon: [["11:00", "15:00"]] },
      paused: false,
      minOrderCents: 0,
      estimatedMinutes: 40,
      pickupEnabled: true,
      deliveryEnabled: true,
      paymentMethods: ["pix", "cash"],
      pixKey: null,
      ownerWhatsapp: null,
    });

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("ON CONFLICT (tenant_id) DO UPDATE");
    expect(query.mock.calls[0]?.[1]?.[0]).toBe(TENANT);
  });
});

describe("delivery zones", () => {
  const ZONE_ROW = { id: 1, neighborhood: "Centro", fee_cents: 500, active: true };

  it("listDeliveryZones filtra por tenant_id", async () => {
    query.mockResolvedValue({ rows: [ZONE_ROW] });

    await listDeliveryZones(TENANT);

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WHERE tenant_id = $1");
    expect(query.mock.calls[0]?.[1]).toEqual([TENANT]);
  });

  it("createDeliveryZone grava a chave normalizada junto do texto original", async () => {
    query.mockResolvedValue({ rows: [ZONE_ROW] });

    await createDeliveryZone(TENANT, {
      neighborhood: "São Cristóvão",
      feeCents: 500,
      active: true,
    });

    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe(TENANT);
    expect(params[1]).toBe("São Cristóvão");
    expect(params[2]).toBe("sao cristovao");
  });

  it("updateDeliveryZone escopa por tenant_id E id", async () => {
    query.mockResolvedValue({ rows: [ZONE_ROW] });

    await updateDeliveryZone(TENANT, 1, {
      neighborhood: "Centro",
      feeCents: 700,
      active: true,
    });

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WHERE tenant_id = $1 AND id = $2");
  });

  it("updateDeliveryZone devolve null quando a linha não é do tenant", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(
      updateDeliveryZone(TENANT, 999, {
        neighborhood: "Centro",
        feeCents: 700,
        active: true,
      }),
    ).resolves.toBeNull();
  });

  it("deleteDeliveryZone devolve false sem afetar linha de outro tenant", async () => {
    query.mockResolvedValue({ rowCount: 0 });

    await expect(deleteDeliveryZone(TENANT, 999)).resolves.toBe(false);

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WHERE tenant_id = $1 AND id = $2");
  });
});
