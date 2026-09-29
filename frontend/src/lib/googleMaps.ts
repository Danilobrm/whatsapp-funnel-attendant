import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

/**
 * Único ponto que carrega o Google Maps JavaScript API (compartilhado pelos
 * mapas de Localização e de Entrega). A promessa é memoizada: o script entra
 * na página uma vez só. Falha de carga NÃO fica memoizada — "tentar de novo"
 * (remontar o mapa) precisa poder recarregar.
 */

export type MapsErrorCode = 'no_key' | 'load_failed';

export class MapsUnavailableError extends Error {
  readonly code: MapsErrorCode;

  constructor(code: MapsErrorCode) {
    super(code);
    this.name = 'MapsUnavailableError';
    this.code = code;
  }
}

export type GoogleMaps = typeof google.maps;

let pending: Promise<GoogleMaps> | null = null;

export function loadGoogleMaps(): Promise<GoogleMaps> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new MapsUnavailableError('no_key'));
  if (pending) return pending;

  setOptions({ key, v: 'weekly', language: 'pt-BR', region: 'BR' });
  pending = Promise.all([
    importLibrary('maps'),
    importLibrary('marker'),
    importLibrary('geocoding'),
  ])
    .then(() => google.maps)
    .catch(() => {
      pending = null;
      throw new MapsUnavailableError('load_failed');
    });
  return pending;
}

/** Só para testes: esquece a promessa memoizada. */
export function resetGoogleMapsLoader(): void {
  pending = null;
}
