import { afterEach, describe, expect, it, vi } from "vitest";

async function loadClient(
  overpassUrls = "https://o1.test/api,https://o2.test/api",
) {
  vi.resetModules();
  vi.stubEnv("OSM_NOMINATIM_URL", "https://nominatim.test");
  vi.stubEnv("OSM_OVERPASS_URLS", overpassUrls);
  vi.stubEnv("OSM_USER_AGENT", "attendant-test");
  return import("./osm.client.js");
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("searchCitiesOsm", () => {
  it("chama o Nominatim restrito ao Brasil, com User-Agent", async () => {
    const { searchCitiesOsm } = await loadClient();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json([
        {
          osm_type: "relation",
          osm_id: 334525,
          name: "Luziânia",
          addresstype: "city",
          address: { state: "Goiás" },
        },
      ]),
    );

    await expect(searchCitiesOsm("luziania")).resolves.toEqual([
      { osmId: 334525, name: "Luziânia", state: "Goiás" },
    ]);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/nominatim\.test\/search\?/);
    expect(url).toContain("countrycodes=br");
    expect(url).toContain("q=luziania");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(
      "attendant-test",
    );
  });

  it("HTTP de erro vira GeoUnavailableError", async () => {
    const { searchCitiesOsm } = await loadClient();
    const { GeoUnavailableError } = await import("../errors/geo.errors.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 503 }),
    );

    await expect(searchCitiesOsm("x")).rejects.toBeInstanceOf(
      GeoUnavailableError,
    );
  });
});

describe("fetchNeighborhoodsOsm", () => {
  it("consulta a área da relation (3600000000 + id)", async () => {
    const { neighborhoodsQuery } = await loadClient();
    expect(neighborhoodsQuery(334525)).toContain("area(3600334525)");
  });

  it("cai para a próxima instância quando a primeira responde HTML (ocupada)", async () => {
    const { fetchNeighborhoodsOsm } = await loadClient();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("<html>too busy</html>", { status: 200 }),
      )
      .mockResolvedValueOnce(
        json({
          elements: [
            {
              type: "way",
              id: 1,
              tags: { name: "Centro" },
              geometry: [
                { lon: 0, lat: 0 },
                { lon: 1, lat: 0 },
                { lon: 1, lat: 1 },
                { lon: 0, lat: 0 },
              ],
            },
          ],
        }),
      );

    const result = await fetchNeighborhoodsOsm(334525);

    expect(result.map((n) => n.name)).toEqual(["Centro"]);
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([
      "https://o1.test/api",
      "https://o2.test/api",
    ]);
  });

  it("todas as instâncias falhando vira GeoUnavailableError", async () => {
    const { fetchNeighborhoodsOsm } = await loadClient();
    const { GeoUnavailableError } = await import("../errors/geo.errors.js");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));

    await expect(fetchNeighborhoodsOsm(1)).rejects.toBeInstanceOf(
      GeoUnavailableError,
    );
  });
});
