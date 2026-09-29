/** Posição GeoJSON: [longitude, latitude]. */
export type Position = [number, number];
export type Ring = Position[];

export type AreaGeometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };

/** Bairro com contorno no OpenStreetMap. `key` = `normalizeNeighborhood(name)`. */
export interface Neighborhood {
  osmId: string;
  name: string;
  key: string;
  geometry: AreaGeometry;
}

/** Resultado da busca de cidade (Google Geocoding). `osmId` é o id da *relation*. */
export interface CityOption {
  osmId: number;
  name: string;
  state: string | null;
}

/** Resultado de geocodificação de endereço (Nominatim). */
export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

export interface StoreGeo {
  cityOsmId: number;
  cityName: string;
  state: string | null;
  cityGeometry: AreaGeometry;
  neighborhoods: Neighborhood[];
  fetchedAt: string;
}
