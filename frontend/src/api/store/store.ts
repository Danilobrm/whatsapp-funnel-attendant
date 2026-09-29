import { request } from '../client/client.ts';

export type PaymentMethod = 'pix' | 'cash' | 'card_on_delivery';
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type DayInterval = [string, string];
export type OpeningHours = Partial<Record<DayKey, DayInterval[]>>;

export const DAY_KEYS: readonly DayKey[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];

export interface StoreSettings {
  timezone: string;
  openingHours: OpeningHours;
  paused: boolean;
  minOrderCents: number;
  estimatedMinutes: number;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  paymentMethods: PaymentMethod[];
  pixKey: string | null;
  ownerWhatsapp: string | null;
  /** Número do atendimento (só dígitos) — destino do "Voltar ao WhatsApp" do cardápio em link. */
  whatsappNumber: string | null;
  restaurantName: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  address: string | null;
  /** Pino do restaurante no mapa — os dois juntos ou nenhum. */
  latitude: number | null;
  longitude: number | null;
  updatedAt?: string | null;
}

export interface DeliveryZone {
  id: number;
  neighborhood: string;
  feeCents: number;
  active: boolean;
}

export interface DeliveryZoneFormInput {
  neighborhood: string;
  feeCents: number;
  active: boolean;
}

/** 422 do backend — `code` decide a mensagem, nunca o `message` cru. */
export class StoreRejectedError extends Error {
  readonly code: string;
  readonly field: string;

  constructor(code: string, field: string) {
    super(code);
    this.name = 'StoreRejectedError';
    this.code = code;
    this.field = field;
  }
}

const onStatus = {
  422: (payload: unknown) => {
    const data = payload as { code?: string; field?: string } | null;
    return new StoreRejectedError(data?.code ?? 'unknown', data?.field ?? '');
  },
};

export function fetchStoreSettings(): Promise<{ settings: StoreSettings }> {
  return request('/api/store');
}

export function saveStoreSettings(
  settings: Omit<StoreSettings, 'updatedAt'>,
): Promise<{ settings: StoreSettings }> {
  return request('/api/store', { method: 'PUT', body: settings, onStatus });
}

export function fetchZones(): Promise<{ zones: DeliveryZone[] }> {
  return request('/api/store/zones');
}

export function createZone(
  input: DeliveryZoneFormInput,
): Promise<{ zone: DeliveryZone }> {
  return request('/api/store/zones', { method: 'POST', body: input, onStatus });
}

export function updateZone(
  id: number,
  input: DeliveryZoneFormInput,
): Promise<{ zone: DeliveryZone }> {
  return request(`/api/store/zones/${id}`, {
    method: 'PUT',
    body: input,
    onStatus,
  });
}

export function deleteZone(id: number): Promise<void> {
  return request(`/api/store/zones/${id}`, { method: 'DELETE', onStatus });
}

/** Posição GeoJSON: [longitude, latitude]. */
export type GeoPosition = [number, number];
export type AreaGeometry =
  | { type: 'Polygon'; coordinates: GeoPosition[][] }
  | { type: 'MultiPolygon'; coordinates: GeoPosition[][][] };

export interface Neighborhood {
  osmId: string;
  name: string;
  /** `normalizeNeighborhood(name)` — casa com a zona de mesmo nome. */
  key: string;
  geometry: AreaGeometry;
}

export interface CityOption {
  osmId: number;
  name: string;
  state: string | null;
}

export interface StoreGeo {
  cityOsmId: number;
  cityName: string;
  state: string | null;
  cityGeometry: AreaGeometry;
  neighborhoods: Neighborhood[];
  fetchedAt: string;
}

/** 502 = OpenStreetMap fora do ar/ocupado — vira `geo_unavailable`. */
const geoOnStatus = {
  ...onStatus,
  502: () => new StoreRejectedError('geo_unavailable', ''),
};

export function fetchStoreGeo(): Promise<{ geo: StoreGeo | null }> {
  return request('/api/store/geo');
}

export function setStoreCity(osmId: number): Promise<{ geo: StoreGeo }> {
  return request('/api/store/geo', {
    method: 'PUT',
    body: { osmId },
    onStatus: geoOnStatus,
  });
}

export function searchCities(q: string): Promise<{ cities: CityOption[] }> {
  return request(`/api/store/geo/cities?q=${encodeURIComponent(q)}`, {
    onStatus: geoOnStatus,
  });
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

/** Endereço livre → pontos (Nominatim via backend). */
export function geocodeAddress(
  q: string,
): Promise<{ results: GeocodeResult[] }> {
  return request(`/api/store/geo/geocode?q=${encodeURIComponent(q)}`, {
    onStatus: geoOnStatus,
  });
}
