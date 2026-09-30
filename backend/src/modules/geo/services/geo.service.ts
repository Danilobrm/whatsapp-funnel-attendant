import { Injectable } from "@nestjs/common";

import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import { GoogleGeocodingClient } from "../clients/google.client.js";
import { OsmClient } from "../clients/osm.client.js";
import { GeoRepository } from "../repositories/geo.repository.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type {
  CityOption,
  GeocodeResult,
  StoreGeo,
} from "../types/geo.types.js";

const MIN_QUERY_CHARS = 2;

const MIN_ADDRESS_CHARS = 3;

@Injectable()
export class GeoService {
  constructor(
    private readonly geo: GeoRepository,
    private readonly osm: OsmClient,
    private readonly google: GoogleGeocodingClient,
  ) {}

  /** Busca não é tenant-scoped: é só um proxy do Nominatim com User-Agent do servidor. */
  async searchCities(q: unknown): Promise<CityOption[]> {
    const text = typeof q === "string" ? q.trim() : "";
    if (text.length < MIN_QUERY_CHARS) return [];
    return this.osm.searchCitiesOsm(text.slice(0, 100));
  }

  /** Proxy do Google Geocoding para o botão "Localizar pelo endereço". */
  async geocodeAddress(q: unknown): Promise<GeocodeResult[]> {
    const text = typeof q === "string" ? q.trim() : "";
    if (text.length < MIN_ADDRESS_CHARS) return [];
    return this.google.geocodeGoogle(text.slice(0, 300));
  }

  getStoreGeo(tenantId: TenantId): Promise<StoreGeo | null> {
    return this.geo.findStoreGeo(tenantId);
  }

  /**
   * Troca a cidade atendida: busca o contorno e os bairros no OSM e grava. Não
   * mexe em `delivery_zones` — as taxas cadastradas continuam valendo pelo nome.
   */
  async setStoreCity(tenantId: TenantId, input: unknown): Promise<StoreGeo> {
    const osmId = (input as { osmId?: unknown } | null)?.osmId;
    if (typeof osmId !== "number" || !Number.isInteger(osmId) || osmId <= 0) {
      throw new InvalidMenuError("city_required", "osmId");
    }

    const city = await this.osm.fetchCityOsm(osmId);
    if (!city) throw new InvalidMenuError("city_not_found", "osmId");

    const neighborhoods = await this.osm.fetchNeighborhoodsOsm(osmId);

    return this.geo.saveStoreGeo(tenantId, {
      cityOsmId: osmId,
      cityName: city.name,
      state: city.state,
      cityGeometry: city.geometry,
      neighborhoods,
    });
  }
}
