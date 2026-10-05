import { beforeEach, describe, expect, it, vi } from "vitest";

const osm = {
  searchCitiesOsm: vi.fn(),
  fetchCityOsm: vi.fn(),
  fetchNeighborhoodsOsm: vi.fn(),
};
const google = { geocodeGoogle: vi.fn() };
const repo = { findStoreGeo: vi.fn(), saveStoreGeo: vi.fn() };

const { GeoService } = await import("./geo.service.js");
const service = new GeoService(repo as never, osm as never, google as never);
const searchCities = service.searchCities.bind(service);
const setStoreCity = service.setStoreCity.bind(service);
const getStoreGeo = service.getStoreGeo.bind(service);
const geocodeAddress = service.geocodeAddress.bind(service);
const { InvalidMenuError } = await import("../../errors/invalidMenu.error.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const TENANT = asTenantId(3);
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

beforeEach(() => {
  vi.resetAllMocks();
});

describe("searchCities", () => {
  it("não chama o OSM com menos de 2 caracteres", async () => {
    await expect(searchCities(" l ")).resolves.toEqual([]);
    await expect(searchCities(undefined)).resolves.toEqual([]);
    expect(osm.searchCitiesOsm).not.toHaveBeenCalled();
  });

  it("repassa o texto aparado", async () => {
    vi.mocked(osm.searchCitiesOsm).mockResolvedValue([]);
    await searchCities("  luzi ");
    expect(osm.searchCitiesOsm).toHaveBeenCalledWith("luzi");
  });
});

describe("setStoreCity", () => {
  it("rejeita osmId ausente/inválido com city_required", async () => {
    for (const body of [{}, { osmId: "1" }, { osmId: -1 }, null]) {
      await expect(setStoreCity(TENANT, body)).rejects.toMatchObject({
        code: "city_required",
      });
    }
    expect(osm.fetchCityOsm).not.toHaveBeenCalled();
  });

  it("city_not_found quando o OSM não tem contorno", async () => {
    vi.mocked(osm.fetchCityOsm).mockResolvedValue(null);
    const error = await setStoreCity(TENANT, { osmId: 9 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(InvalidMenuError);
    expect(error).toMatchObject({ code: "city_not_found" });
    expect(repo.saveStoreGeo).not.toHaveBeenCalled();
  });

  it("busca cidade + bairros e grava no tenant", async () => {
    vi.mocked(osm.fetchCityOsm).mockResolvedValue({
      name: "Luziânia",
      state: "Goiás",
      geometry: POLY,
    });
    const neighborhoods = [
      { osmId: "way/1", name: "Centro", key: "centro", geometry: POLY },
    ];
    vi.mocked(osm.fetchNeighborhoodsOsm).mockResolvedValue(neighborhoods);
    vi.mocked(repo.saveStoreGeo).mockImplementation(async (_t, geo) => ({
      ...geo,
      fetchedAt: "now",
    }));

    const geo = await setStoreCity(TENANT, { osmId: 334525 });

    expect(osm.fetchNeighborhoodsOsm).toHaveBeenCalledWith(334525);
    expect(repo.saveStoreGeo).toHaveBeenCalledWith(TENANT, {
      cityOsmId: 334525,
      cityName: "Luziânia",
      state: "Goiás",
      cityGeometry: POLY,
      neighborhoods,
    });
    expect(geo.cityName).toBe("Luziânia");
  });
});

describe("geocodeAddress", () => {
  it("ignora texto curto e repassa o aparado", async () => {
    await expect(geocodeAddress("ab")).resolves.toEqual([]);
    expect(google.geocodeGoogle).not.toHaveBeenCalled();

    vi.mocked(google.geocodeGoogle).mockResolvedValue([]);
    await geocodeAddress("  Rua 1 ");
    expect(google.geocodeGoogle).toHaveBeenCalledWith("Rua 1");
  });
});

describe("getStoreGeo", () => {
  it("lê do repositório pelo tenant", async () => {
    vi.mocked(repo.findStoreGeo).mockResolvedValue(null);
    await expect(getStoreGeo(TENANT)).resolves.toBeNull();
    expect(repo.findStoreGeo).toHaveBeenCalledWith(TENANT);
  });
});
