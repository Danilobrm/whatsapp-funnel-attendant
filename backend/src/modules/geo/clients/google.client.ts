import { Injectable } from "@nestjs/common";

import { env } from "../../../config/env.js";
import { fetchWithTimeout } from "../../../lib/fetchWithTimeout.js";
import { GeoUnavailableError } from "../errors/geo.errors.js";
import {
  isGeocodeStatusOk,
  parseGoogleGeocode,
} from "../utils/google.parse.js";
import type { GeocodeResult } from "../types/geo.types.js";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

@Injectable()
export class GoogleGeocodingClient {
  private async getGeocode(
    query: Record<string, string>,
  ): Promise<GeocodeResult[]> {
    if (!env.google.geocodingApiKey)
      throw new GeoUnavailableError("no_api_key");

    const params = new URLSearchParams({
      ...query,
      language: "pt-BR",
      key: env.google.geocodingApiKey,
    });

    let res: Response;
    try {
      res = await fetchWithTimeout(env.google.timeoutMs)(
        `${GEOCODE_URL}?${params}`,
      );
    } catch (error) {
      throw new GeoUnavailableError(
        error instanceof Error ? error.name : "fetch_failed",
      );
    }
    if (!res.ok) throw new GeoUnavailableError(`http_${res.status}`);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new GeoUnavailableError("invalid_json");
    }
    if (!isGeocodeStatusOk(body)) {
      const status = (body as { status?: unknown } | null)?.status;
      throw new GeoUnavailableError(`status_${String(status)}`);
    }
    return parseGoogleGeocode(body);
  }

  /**
   * Endereço livre → pontos. O Google responde 200 mesmo em erro
   * (`status: REQUEST_DENIED`…), então o `status` do corpo também decide.
   */
  geocodeGoogle(q: string): Promise<GeocodeResult[]> {
    return this.getGeocode({
      address: q,
      region: "br",
      components: "country:BR",
    });
  }

  /**
   * Ponto → endereço (geocodificação reversa): o endereço da loja é o texto que o
   * Google devolve para a localização atual do dono. `null` = nenhum endereço ali.
   */
  async reverseGeocodeGoogle(
    lat: number,
    lng: number,
  ): Promise<GeocodeResult | null> {
    const results = await this.getGeocode({ latlng: `${lat},${lng}` });
    const first = results[0];
    // Devolve o endereço do ponto pedido (não o do centro do resultado).
    return first ? { ...first, lat, lng } : null;
  }
}
