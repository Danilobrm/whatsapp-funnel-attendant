import { beforeEach, describe, expect, it, vi } from "vitest";

const { asTenantId } = await import("../../tenants/types/tenant.types.js");
const query = vi.fn();
const { GeoRepository } = await import("./geo.repository.js");
const { TenantDb } = await import("../../../common/database/tenantDb.js");
const { bound } = await import("../../../test/bind.js");
const repository = new GeoRepository(new TenantDb({ query } as never));
const { findStoreGeo, saveStoreGeo } = bound(repository, [
  "findStoreGeo",
  "saveStoreGeo",
]);

const TENANT = asTenantId(5);
const POLY = {
  type: "Polygon" as const,
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ] as [number, number][][],
};

const ROW = {
  city_osm_id: "334525",
  city_name: "Luziânia",
  state: "Goiás",
  city_geometry: POLY,
  neighborhoods: [],
  fetched_at: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("findStoreGeo", () => {
  it("filtra por tenant_id e converte BIGINT/data", async () => {
    query.mockResolvedValue({ rows: [ROW] });

    const geo = await findStoreGeo(TENANT);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE tenant_id = \$1/);
    expect(params).toEqual([TENANT]);
    expect(geo).toMatchObject({
      cityOsmId: 334525,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("null sem linha", async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(findStoreGeo(TENANT)).resolves.toBeNull();
  });
});

describe("saveStoreGeo", () => {
  it("faz upsert por tenant com JSON serializado", async () => {
    query.mockResolvedValue({ rows: [ROW] });

    await saveStoreGeo(TENANT, {
      cityOsmId: 334525,
      cityName: "Luziânia",
      state: "Goiás",
      cityGeometry: POLY,
      neighborhoods: [],
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/ON CONFLICT \(tenant_id\) DO UPDATE/);
    expect(params).toEqual([
      TENANT,
      334525,
      "Luziânia",
      "Goiás",
      JSON.stringify(POLY),
      "[]",
    ]);
  });
});
