import type { OpeningHours } from "../utils/store.hours.js";

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
  /** Número do atendimento (só dígitos, com DDI) — destino do wa.me da página do cardápio. */
  whatsappNumber: string | null;
  restaurantName: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  /** Endereço livre (rua, número, bairro, cidade) — o agente usa na retirada. */
  address: string | null;
  /** Pino no mapa; `null` nos dois quando não marcado. */
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

export type DeliveryZoneInput = Omit<DeliveryZone, "id">;
