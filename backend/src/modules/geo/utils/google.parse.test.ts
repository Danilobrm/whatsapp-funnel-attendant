import { describe, expect, it } from "vitest";

import { isGeocodeStatusOk, parseGoogleGeocode } from "./google.parse.js";

describe("parseGoogleGeocode", () => {
  it("extrai lat/lng/endereço e descarta item incompleto", () => {
    expect(
      parseGoogleGeocode({
        status: "OK",
        results: [
          {
            formatted_address: "Rua 1, Luziânia - GO",
            geometry: { location: { lat: -16.2525, lng: -47.9503 } },
          },
          { formatted_address: "sem coordenada", geometry: {} },
          { geometry: { location: { lat: 1, lng: 2 } } },
          {
            formatted_address: "lat string",
            geometry: { location: { lat: "1", lng: 2 } },
          },
        ],
      }),
    ).toEqual([
      { lat: -16.2525, lng: -47.9503, label: "Rua 1, Luziânia - GO" },
    ]);
  });

  it("limita a 5 resultados", () => {
    const results = Array.from({ length: 8 }, (_, i) => ({
      formatted_address: `Rua ${i}`,
      geometry: { location: { lat: i, lng: i } },
    }));
    expect(parseGoogleGeocode({ results })).toHaveLength(5);
  });

  it("resposta inesperada vira lista vazia", () => {
    expect(parseGoogleGeocode(null)).toEqual([]);
    expect(parseGoogleGeocode({ status: "OK" })).toEqual([]);
  });
});

describe("isGeocodeStatusOk", () => {
  it("aceita OK e ZERO_RESULTS; recusa o resto", () => {
    expect(isGeocodeStatusOk({ status: "OK" })).toBe(true);
    expect(isGeocodeStatusOk({ status: "ZERO_RESULTS" })).toBe(true);
    expect(isGeocodeStatusOk({ status: "REQUEST_DENIED" })).toBe(false);
    expect(isGeocodeStatusOk(null)).toBe(false);
  });
});
