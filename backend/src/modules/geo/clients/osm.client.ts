import { Injectable } from "@nestjs/common";

import { env } from "../../../config/env.js";
import { fetchWithTimeout } from "../../../lib/fetchWithTimeout.js";
import { GeoUnavailableError } from "../errors/geo.errors.js";
import {
  parseCityLookup,
  parseCitySearch,
  parseNeighborhoods,
} from "../utils/osm.parse.js";
import type {
  AreaGeometry,
  CityOption,
  Neighborhood,
} from "../types/geo.types.js";

/**
 * Cliente do OpenStreetMap. Só roda quando o dono busca/escolhe a cidade no
 * painel — nunca no caminho de uma mensagem do cliente.
 */

const headers = () => ({
  "User-Agent": env.osm.userAgent,
  Accept: "application/json",
});

/** Overpass: bairros dentro da área da cidade (place=suburb/neighbourhood/quarter ou admin 9/10). */
export function neighborhoodsQuery(osmId: number): string {
  const areaId = 3_600_000_000 + osmId;
  return `[out:json][timeout:80];
area(${areaId})->.a;
(
  way(area.a)["place"~"^(suburb|neighbourhood|quarter)$"]["name"];
  relation(area.a)["place"~"^(suburb|neighbourhood|quarter)$"]["name"];
  relation(area.a)["boundary"="administrative"]["admin_level"~"^(9|10)$"]["name"];
);
out geom;`;
}

@Injectable()
export class OsmClient {
  private async getJson(url: string): Promise<unknown> {
    let res: Response;
    try {
      res = await fetchWithTimeout(env.osm.timeoutMs)(url, {
        headers: headers(),
      });
    } catch (error) {
      throw new GeoUnavailableError(
        error instanceof Error ? error.name : "fetch_failed",
      );
    }
    if (!res.ok) throw new GeoUnavailableError(`http_${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new GeoUnavailableError("invalid_json");
    }
  }

  async searchCitiesOsm(q: string): Promise<CityOption[]> {
    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      countrycodes: "br",
      addressdetails: "1",
      featureType: "city",
      limit: "8",
    });
    return parseCitySearch(
      await this.getJson(`${env.osm.nominatimUrl}/search?${params}`),
    );
  }

  async fetchCityOsm(osmId: number): Promise<{
    name: string;
    state: string | null;
    geometry: AreaGeometry;
  } | null> {
    const params = new URLSearchParams({
      osm_ids: `R${osmId}`,
      format: "geojson",
      polygon_geojson: "1",
      // Simplifica o contorno (graus) — ~50m, invisível no zoom da cidade e
      // corta o JSON guardado de centenas de KB para dezenas.
      polygon_threshold: "0.0005",
      addressdetails: "1",
    });
    return parseCityLookup(
      await this.getJson(`${env.osm.nominatimUrl}/lookup?${params}`),
    );
  }

  async fetchNeighborhoodsOsm(osmId: number): Promise<Neighborhood[]> {
    const body = new URLSearchParams({ data: neighborhoodsQuery(osmId) });
    let lastError: unknown = new GeoUnavailableError("no_overpass_url");

    for (const url of env.osm.overpassUrls) {
      try {
        const res = await fetchWithTimeout(env.osm.timeoutMs)(url, {
          method: "POST",
          headers: {
            ...headers(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });
        if (!res.ok) throw new GeoUnavailableError(`http_${res.status}`);
        // Overpass ocupado responde 200 com HTML de erro — `json()` falha e
        // passamos para a próxima instância.
        return parseNeighborhoods(await res.json());
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof GeoUnavailableError
      ? lastError
      : new GeoUnavailableError("overpass_failed");
  }
}
