import type { OpeningHours } from "./store.hours.js";

export const PAYMENT_METHODS = ["pix", "cash", "card_on_delivery"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

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

export type DeliveryZoneInput = Omit<DeliveryZone, "id">;
