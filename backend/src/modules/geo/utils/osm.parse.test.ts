import { describe, expect, it } from "vitest";

import {
  assembleRings,
  parseCityLookup,
  parseCitySearch,
  parseNeighborhoods,
} from "./osm.parse.js";

import type { Position } from "../types/geo.types.js";

describe("parseCitySearch", () => {
  it("mantém só relations de cidade, sem duplicar, com o estado", () => {
    const cities = parseCitySearch([
      {
        osm_type: "relation",
        osm_id: 334525,
        name: "Luziânia",
        addresstype: "city",
        address: { state: "Goiás" },
      },
      {
        osm_type: "relation",
        osm_id: 334525,
        name: "Luziânia",
        addresstype: "city",
      },
      { osm_type: "node", osm_id: 1, name: "Luziânia", addresstype: "city" },
      { osm_type: "relation", osm_id: 2, name: "Rua X", addresstype: "road" },
      {
        osm_type: "relation",
        osm_id: 3,
        name: "Vila Y",
        addresstype: "village",
      },
    ]);
    expect(cities).toEqual([
      { osmId: 334525, name: "Luziânia", state: "Goiás" },
      { osmId: 3, name: "Vila Y", state: null },
    ]);
  });

  it("resposta inesperada vira lista vazia", () => {
    expect(parseCitySearch({ error: "x" })).toEqual([]);
  });
});

describe("parseCityLookup", () => {
  it("extrai nome, estado e geometria (arredondada a 6 casas)", () => {
    const result = parseCityLookup({
      features: [
        {
          properties: { name: "Luziânia", address: { state: "Goiás" } },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-47.1234567891, -16.1],
                [-47.2, -16.2],
                [-47.3, -16.1],
                [-47.1234567891, -16.1],
              ],
            ],
          },
        },
      ],
    });
    expect(result?.name).toBe("Luziânia");
    expect(result?.state).toBe("Goiás");
    expect(result?.geometry.type).toBe("Polygon");
    expect(result?.geometry.coordinates[0]?.[0]).toEqual([-47.123457, -16.1]);
  });

  it("null quando não há polígono (ex.: cidade só como ponto)", () => {
    expect(
      parseCityLookup({
        features: [
          {
            properties: { name: "X" },
            geometry: { type: "Point", coordinates: [0, 0] },
          },
        ],
      }),
    ).toBeNull();
    expect(parseCityLookup({ features: [] })).toBeNull();
  });
});

describe("assembleRings", () => {
  const a: Position = [0, 0];
  const b: Position = [1, 0];
  const c: Position = [1, 1];
  const d: Position = [0, 1];

  it("encadeia trechos fora de ordem e em sentido invertido", () => {
    const rings = assembleRings([
      [c, d, a],
      [a, b],
      [c, b], // invertido
    ]);
    expect(rings).toEqual([[c, d, a, b, c]]);
  });

  it("devolve vários anéis e descarta trecho que não fecha", () => {
    const e: Position = [5, 5];
    const f: Position = [6, 5];
    const g: Position = [6, 6];
    const rings = assembleRings([
      [a, b, c, a],
      [e, f, g, e],
      [
        [9, 9],
        [10, 10],
      ],
    ]);
    expect(rings).toHaveLength(2);
  });
});

describe("parseNeighborhoods", () => {
  const pt = (lon: number, lat: number) => ({ lon, lat });

  it("converte way fechado e relation multi-way, com key normalizada", () => {
    const result = parseNeighborhoods({
      elements: [
        {
          type: "way",
          id: 10,
          tags: { name: "Setor Mandu" },
          geometry: [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 0)],
        },
        {
          type: "relation",
          id: 20,
          tags: { name: "Parque Alvorada I" },
          members: [
            { type: "way", role: "outer", geometry: [pt(2, 0), pt(3, 0)] },
            { type: "way", role: "outer", geometry: [pt(3, 1), pt(3, 0)] },
            {
              type: "way",
              role: "outer",
              geometry: [pt(3, 1), pt(2, 1), pt(2, 0)],
            },
          ],
        },
      ],
    });

    expect(
      result.map((n) => [n.name, n.key, n.osmId, n.geometry.type]),
    ).toEqual([
      ["Parque Alvorada I", "parque alvorada i", "relation/20", "Polygon"],
      ["Setor Mandu", "setor mandu", "way/10", "Polygon"],
    ]);
    expect(result[1]?.geometry.coordinates[0]).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]);
  });

  it("relation com várias partes vira MultiPolygon", () => {
    const [n] = parseNeighborhoods({
      elements: [
        {
          type: "relation",
          id: 1,
          tags: { name: "Chácaras" },
          members: [
            {
              type: "way",
              role: "outer",
              geometry: [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 0)],
            },
            {
              type: "way",
              role: "outer",
              geometry: [pt(5, 5), pt(6, 5), pt(6, 6), pt(5, 5)],
            },
          ],
        },
      ],
    });
    expect(n?.geometry.type).toBe("MultiPolygon");
    expect(n?.geometry.coordinates).toHaveLength(2);
  });

  it("ignora sem nome, sem contorno fechado e nome repetido (acento/caixa)", () => {
    const square = [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 0)];
    const result = parseNeighborhoods({
      elements: [
        { type: "way", id: 1, tags: {}, geometry: square },
        {
          type: "way",
          id: 2,
          tags: { name: "Aberto" },
          geometry: [pt(0, 0), pt(1, 1)],
        },
        { type: "way", id: 3, tags: { name: "São Caetano" }, geometry: square },
        { type: "way", id: 4, tags: { name: "sao caetano" }, geometry: square },
      ],
    });
    expect(result.map((n) => n.osmId)).toEqual(["way/3"]);
  });
});
