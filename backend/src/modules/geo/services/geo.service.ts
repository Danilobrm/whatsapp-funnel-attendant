import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import { findStoreGeo, saveStoreGeo } from "../repositories/geo.repository.js";
import {
  fetchCityOsm,
  fetchNeighborhoodsOsm,
  searchCitiesOsm,
} from "../clients/osm.client.js";
import { geocodeGoogle } from "../clients/google.client.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { CityOption, GeocodeResult, StoreGeo } from "../types/geo.types.js";

const MIN_QUERY_CHARS = 2;

/** Busca não é tenant-scoped: é só um proxy do Nominatim com User-Agent do servidor. */
export async function searchCities(q: unknown): Promise<CityOption[]> {
  const text = typeof q === "string" ? q.trim() : "";
  if (text.length < MIN_QUERY_CHARS) return [];
  return searchCitiesOsm(text.slice(0, 100));
}

const MIN_ADDRESS_CHARS = 3;

/** Proxy do Google Geocoding para o botão "Localizar pelo endereço". */
export async function geocodeAddress(q: unknown): Promise<GeocodeResult[]> {
  const text = typeof q === "string" ? q.trim() : "";
  if (text.length < MIN_ADDRESS_CHARS) return [];
  return geocodeGoogle(text.slice(0, 300));
}

export function getStoreGeo(tenantId: TenantId): Promise<StoreGeo | null> {
  return findStoreGeo(tenantId);
}

/**
 * Troca a cidade atendida: busca o contorno e os bairros no OSM e grava. Não
 * mexe em `delivery_zones` — as taxas cadastradas continuam valendo pelo nome.
 */
export async function setStoreCity(
  tenantId: TenantId,
  input: unknown,
): Promise<StoreGeo> {
  const osmId = (input as { osmId?: unknown } | null)?.osmId;
  if (typeof osmId !== "number" || !Number.isInteger(osmId) || osmId <= 0) {
    throw new InvalidMenuError("city_required", "osmId");
  }

  const city = await fetchCityOsm(osmId);
  if (!city) throw new InvalidMenuError("city_not_found", "osmId");

  const neighborhoods = await fetchNeighborhoodsOsm(osmId);

  return saveStoreGeo(tenantId, {
    cityOsmId: osmId,
    cityName: city.name,
    state: city.state,
    cityGeometry: city.geometry,
    neighborhoods,
  });
}
