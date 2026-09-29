import { afterEach, describe, expect, it, vi } from "vitest";

async function loadClient(key = "server-key") {
  vi.resetModules();
  vi.stubEnv("GOOGLE_GEOCODING_API_KEY", key);
  const client = await import("./google.client.js");
  const { GeoUnavailableError } = await import("../errors/geo.errors.js");
  return { ...client, GeoUnavailableError };
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

describe("geocodeGoogle", () => {
  it("consulta o Geocoding restrito ao Brasil, com a chave do servidor", async () => {
    const { geocodeGoogle } = await loadClient();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        status: "OK",
        results: [
          {
            formatted_address: "Rua 1",
            geometry: { location: { lat: -16.25, lng: -47.95 } },
          },
        ],
      }),
    );

    await expect(geocodeGoogle("Rua 1, Luziânia")).resolves.toEqual([
      { lat: -16.25, lng: -47.95, label: "Rua 1" },
    ]);
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toMatch(
      /^https:\/\/maps\.googleapis\.com\/maps\/api\/geocode\/json\?/,
    );
    expect(url).toContain("components=country%3ABR");
    expect(url).toContain("key=server-key");
  });

  it("ZERO_RESULTS vira lista vazia", async () => {
    const { geocodeGoogle } = await loadClient();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ status: "ZERO_RESULTS", results: [] }),
    );
    await expect(geocodeGoogle("xyz")).resolves.toEqual([]);
  });

  it("sem chave → GeoUnavailableError, sem chamar a rede", async () => {
    const { geocodeGoogle, GeoUnavailableError } = await loadClient("");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(geocodeGoogle("Rua 1")).rejects.toBeInstanceOf(
      GeoUnavailableError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("REQUEST_DENIED (200 com erro no corpo) → GeoUnavailableError", async () => {
    const { geocodeGoogle, GeoUnavailableError } = await loadClient();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ status: "REQUEST_DENIED", results: [] }),
    );
    await expect(geocodeGoogle("Rua 1")).rejects.toBeInstanceOf(
      GeoUnavailableError,
    );
  });

  it("HTTP != 2xx, corpo inválido e falha de rede → GeoUnavailableError", async () => {
    const { geocodeGoogle, GeoUnavailableError } = await loadClient();
    const spy = vi.spyOn(globalThis, "fetch");

    spy.mockResolvedValueOnce(json({}, 500));
    await expect(geocodeGoogle("Rua 1")).rejects.toBeInstanceOf(
      GeoUnavailableError,
    );

    spy.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    await expect(geocodeGoogle("Rua 1")).rejects.toBeInstanceOf(
      GeoUnavailableError,
    );

    spy.mockRejectedValueOnce(new Error("boom"));
    await expect(geocodeGoogle("Rua 1")).rejects.toBeInstanceOf(
      GeoUnavailableError,
    );
  });
});

describe("reverseGeocodeGoogle", () => {
  it("consulta por latlng e devolve o endereço no ponto pedido", async () => {
    const { reverseGeocodeGoogle } = await loadClient();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        status: "OK",
        results: [
          {
            formatted_address: "Rua 1, 100 - Centro, Luziânia - GO",
            geometry: { location: { lat: -16.2501, lng: -47.9502 } },
          },
        ],
      }),
    );

    await expect(reverseGeocodeGoogle(-16.25, -47.95)).resolves.toEqual({
      lat: -16.25,
      lng: -47.95,
      label: "Rua 1, 100 - Centro, Luziânia - GO",
    });
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain("latlng=-16.25%2C-47.95");
    expect(url).toContain("key=server-key");
  });

  it("ZERO_RESULTS → null; sem chave → GeoUnavailableError", async () => {
    const { reverseGeocodeGoogle } = await loadClient();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ status: "ZERO_RESULTS", results: [] }),
    );
    await expect(reverseGeocodeGoogle(0, 0)).resolves.toBeNull();

    const noKey = await loadClient("");
    await expect(noKey.reverseGeocodeGoogle(0, 0)).rejects.toBeInstanceOf(
      noKey.GeoUnavailableError,
    );
  });
});
