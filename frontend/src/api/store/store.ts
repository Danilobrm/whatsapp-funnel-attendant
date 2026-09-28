import { request } from '../client';

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
