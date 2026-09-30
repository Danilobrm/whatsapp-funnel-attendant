import { beforeEach, describe, expect, it, vi } from "vitest";

const { asTenantId } = await import("../../tenants/types/tenant.types.js");
const query = vi.fn();
const { StoreRepository } = await import("./store.repository.js");
const { TenantDb } = await import("../../../common/database/tenantDb.js");
const { bound } = await import("../../../test/bind.js");
const repository = new StoreRepository(new TenantDb({ query } as never));
const {
  findStoreSettings,
  saveStoreSettings,
  listDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
} = bound(repository, [
  "findStoreSettings",
  "saveStoreSettings",
  "listDeliveryZones",
  "createDeliveryZone",
  "updateDeliveryZone",
  "deleteDeliveryZone",
]);

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
  whatsapp_number: "5561999990000",
  restaurant_name: "Pizzaria Demo",
  logo_url: null,
  contact_email: "contato@pizzaria.com",
  address: "Rua 1, 100",
  latitude: -16.25,
  longitude: -47.95,
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

  it("mapeia as informações do restaurante (snake → camel)", async () => {
    query.mockResolvedValue({ rows: [SETTINGS_ROW] });

    await expect(findStoreSettings(TENANT)).resolves.toMatchObject({
      restaurantName: "Pizzaria Demo",
      logoUrl: null,
      contactEmail: "contato@pizzaria.com",
      address: "Rua 1, 100",
    });
  });

  it("mapeia o número do atendimento", async () => {
    query.mockResolvedValue({ rows: [SETTINGS_ROW] });

    await expect(findStoreSettings(TENANT)).resolves.toMatchObject({
      whatsappNumber: "5561999990000",
    });
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
      whatsappNumber: "5561999990000",
      restaurantName: "Pizzaria Demo",
      logoUrl: null,
      contactEmail: "contato@pizzaria.com",
      address: "Rua 1, 100",
      latitude: -16.25,
      longitude: -47.95,
    });

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("ON CONFLICT (tenant_id) DO UPDATE");
    expect(sql).toContain("restaurant_name = EXCLUDED.restaurant_name");
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe(TENANT);
    expect(params.slice(10)).toEqual([
      null, // owner_whatsapp
      "5561999990000",
      "Pizzaria Demo",
      null,
      "contato@pizzaria.com",
      "Rua 1, 100",
      -16.25,
      -47.95,
    ]);
  });
});

describe("delivery zones", () => {
  const ZONE_ROW = {
    id: 1,
    neighborhood: "Centro",
    fee_cents: 500,
    active: true,
  };

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
