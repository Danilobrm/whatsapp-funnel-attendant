import { normalizeNeighborhood } from "../../store/utils/neighborhood.js";

import type {
  AreaGeometry,
  CityOption,
  Neighborhood,
  Position,
  Ring,
} from "../types/geo.types.js";

/**
 * Funções puras que traduzem as respostas do Nominatim/Overpass para o
 * formato guardado em `store_geo`. Sem rede — testadas com fixtures pequenas.
 */

const CITY_TYPES = new Set(["city", "town", "municipality", "village"]);

interface NominatimSearchItem {
  osm_type?: unknown;
  osm_id?: unknown;
  name?: unknown;
  addresstype?: unknown;
  address?: { state?: unknown };
}

export function parseCitySearch(json: unknown): CityOption[] {
  if (!Array.isArray(json)) return [];
  const seen = new Set<number>();
  const result: CityOption[] = [];
  for (const raw of json as NominatimSearchItem[]) {
    if (raw.osm_type !== "relation") continue;
    if (typeof raw.osm_id !== "number" || typeof raw.name !== "string")
      continue;
    if (typeof raw.addresstype === "string" && !CITY_TYPES.has(raw.addresstype))
      continue;
    if (seen.has(raw.osm_id)) continue;
    seen.add(raw.osm_id);
    result.push({
      osmId: raw.osm_id,
      name: raw.name,
      state: typeof raw.address?.state === "string" ? raw.address.state : null,
    });
  }
  return result;
}

function isAreaGeometry(value: unknown): value is AreaGeometry {
  if (!value || typeof value !== "object") return false;
  const g = value as { type?: unknown; coordinates?: unknown };
  return (
    (g.type === "Polygon" || g.type === "MultiPolygon") &&
    Array.isArray(g.coordinates)
  );
}

/** `lookup?format=geojson&polygon_geojson=1` → geometria + nome da cidade. */
export function parseCityLookup(
  json: unknown,
): { name: string; state: string | null; geometry: AreaGeometry } | null {
  const features = (json as { features?: unknown })?.features;
  if (!Array.isArray(features)) return null;
  const feature = features[0] as
    | {
        geometry?: unknown;
        properties?: { name?: unknown; address?: { state?: unknown } };
      }
    | undefined;
  if (!feature || !isAreaGeometry(feature.geometry)) return null;
  const name = feature.properties?.name;
  if (typeof name !== "string") return null;
  const state = feature.properties?.address?.state;
  return {
    name,
    state: typeof state === "string" ? state : null,
    geometry: roundGeometry(feature.geometry),
  };
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function roundGeometry(geometry: AreaGeometry): AreaGeometry {
  const ring = (r: Ring): Ring =>
    r.map(([lon, lat]) => [round(lon), round(lat)]);
  return geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: geometry.coordinates.map(ring) }
    : {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((p) => p.map(ring)),
      };
}

const samePoint = (a: Position | undefined, b: Position | undefined) =>
  !!a && !!b && a[0] === b[0] && a[1] === b[1];

/**
 * Junta os trechos de way de uma relation em anéis fechados. O OSM divide o
 * contorno de um bairro em vários ways, em qualquer ordem e sentido; aqui eles
 * são encadeados pela ponta. Trecho que não fecha é descartado — melhor um
 * bairro a menos no mapa do que um polígono torto.
 */
export function assembleRings(segments: Position[][]): Ring[] {
  const pending = segments.filter((s) => s.length >= 2).map((s) => [...s]);
  const rings: Ring[] = [];

  while (pending.length > 0) {
    const ring = pending.shift() as Position[];
    let extended = true;
    while (!samePoint(ring[0], ring[ring.length - 1]) && extended) {
      extended = false;
      const tail = ring[ring.length - 1];
      for (let i = 0; i < pending.length; i++) {
        const seg = pending[i] as Position[];
        if (samePoint(seg[0], tail)) {
          ring.push(...seg.slice(1));
        } else if (samePoint(seg[seg.length - 1], tail)) {
          ring.push(...[...seg].reverse().slice(1));
        } else {
          continue;
        }
        pending.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1])) {
      rings.push(ring);
    }
  }
  return rings;
}

interface OverpassPoint {
  lat: number;
  lon: number;
}
interface OverpassElement {
  type?: unknown;
  id?: unknown;
  tags?: { name?: unknown };
  geometry?: OverpassPoint[];
  members?: { type?: unknown; role?: unknown; geometry?: OverpassPoint[] }[];
}

const toPositions = (points: OverpassPoint[] | undefined): Position[] =>
  (points ?? []).map((p) => [round(p.lon), round(p.lat)]);

function elementGeometry(el: OverpassElement): AreaGeometry | null {
  if (el.type === "way") {
    const [ring] = assembleRings([toPositions(el.geometry)]);
    return ring ? { type: "Polygon", coordinates: [ring] } : null;
  }
  if (el.type === "relation") {
    const members = el.members ?? [];
    const byRole = (role: string) =>
      members
        .filter((m) => m.type === "way" && (m.role || "outer") === role)
        .map((m) => toPositions(m.geometry));
    const outers = assembleRings(byRole("outer"));
    const inners = assembleRings(byRole("inner"));
    if (outers.length === 0) return null;
    if (outers.length === 1) {
      return { type: "Polygon", coordinates: [outers[0] as Ring, ...inners] };
    }
    // Várias partes: buraco ignorado — atribuir cada inner à sua outer exige
    // teste de ponto-em-polígono e bairro com buraco + várias partes é raro.
    return { type: "MultiPolygon", coordinates: outers.map((o) => [o]) };
  }
  return null;
}

/** `out geom` do Overpass → bairros com nome, um por `key` (o primeiro vence). */
export function parseNeighborhoods(json: unknown): Neighborhood[] {
  const elements = (json as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];

  const byKey = new Map<string, Neighborhood>();
  for (const el of elements as OverpassElement[]) {
    const name = typeof el.tags?.name === "string" ? el.tags.name.trim() : "";
    if (!name) continue;
    const key = normalizeNeighborhood(name);
    if (byKey.has(key)) continue;
    const geometry = elementGeometry(el);
    if (!geometry) continue;
    byKey.set(key, {
      osmId: `${String(el.type)}/${String(el.id)}`,
      name,
      key,
      geometry,
    });
  }
  return [...byKey.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
}
