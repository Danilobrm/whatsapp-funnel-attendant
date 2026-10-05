import type { GeocodeResult } from "../types/geo.types.js";

/**
 * Funções puras que traduzem a resposta do Google Geocoding para o formato do
 * painel. Sem rede — testadas com fixtures pequenas.
 */

const MAX_RESULTS = 5;

/** Status que significam "funcionou" (`ZERO_RESULTS` = nenhum endereço). */
export function isGeocodeStatusOk(json: unknown): boolean {
  const status = (json as { status?: unknown } | null)?.status;
  return status === "OK" || status === "ZERO_RESULTS";
}

/** `geocode/json` → pontos. Descarta itens sem coordenada ou rótulo. */
export function parseGoogleGeocode(json: unknown): GeocodeResult[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const out: GeocodeResult[] = [];
  for (const raw of results as {
    formatted_address?: unknown;
    geometry?: { location?: { lat?: unknown; lng?: unknown } };
  }[]) {
    const lat = raw.geometry?.location?.lat;
    const lng = raw.geometry?.location?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (typeof raw.formatted_address !== "string") continue;
    out.push({ lat, lng, label: raw.formatted_address });
    if (out.length === MAX_RESULTS) break;
  }
  return out;
}
