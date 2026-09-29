/**
 * Enquadramento inicial do mapa de localização (puro, testável sem Google Maps):
 * pino marcado → zoom de rua nele; senão, a cidade da aba Entrega; senão, o
 * Brasil inteiro.
 */

export type LatLng = { lat: number; lng: number };
export type Bounds = [[number, number], [number, number]];

export type InitialView =
  | { kind: 'point'; center: [number, number]; zoom: number }
  | { kind: 'bounds'; bounds: Bounds };

export const STREET_ZOOM = 16;
const BRAZIL: Bounds = [
  [-33.8, -74.0],
  [5.3, -34.8],
];

export function initialView(
  position: LatLng | null,
  cityBounds: Bounds | null,
): InitialView {
  if (position) {
    return {
      kind: 'point',
      center: [position.lat, position.lng],
      zoom: STREET_ZOOM,
    };
  }
  return { kind: 'bounds', bounds: cityBounds ?? BRAZIL };
}

/** `latitude`/`longitude` do settings → ponto, só quando os dois existem. */
export function positionOf(settings: {
  latitude: number | null;
  longitude: number | null;
}): LatLng | null {
  return settings.latitude !== null && settings.longitude !== null
    ? { lat: settings.latitude, lng: settings.longitude }
    : null;
}

/** Arredonda a 6 casas (~10 cm) — o arraste do mapa gera 15 casas de ruído. */
export function roundLatLng({ lat, lng }: LatLng): LatLng {
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return { lat: r(lat), lng: r(lng) };
}
