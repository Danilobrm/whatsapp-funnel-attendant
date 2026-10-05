/**
 * Provedor de mapas (OpenStreetMap ou Google Geocoding) fora do ar, lento ou respondendo lixo.
 * Mapeado para HTTP 502 em `errorHandler`: a falha é do provedor externo, não
 * da entrada do dono — o frontend oferece "tentar de novo".
 */
export class GeoUnavailableError extends Error {
  readonly code = "geo_unavailable" as const;

  constructor(detail: string) {
    super(`geo_unavailable:${detail}`);
    this.name = "GeoUnavailableError";
  }
}
