import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import { PAYMENT_METHODS, type PaymentMethod } from "../types/store.types.js";
import {
  DAY_KEYS,
  type DayInterval,
  type OpeningHours,
} from "./store.hours.js";

import type { DeliveryZone, StoreSettings } from "../types/store.types.js";

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  timezone: "America/Sao_Paulo",
  openingHours: {},
  paused: false,
  minOrderCents: 0,
  estimatedMinutes: 40,
  pickupEnabled: true,
  deliveryEnabled: true,
  paymentMethods: ["pix", "cash"],
  pixKey: null,
  ownerWhatsapp: null,
  whatsappNumber: null,
  restaurantName: null,
  logoUrl: null,
  contactEmail: null,
  address: null,
  latitude: null,
  longitude: null,
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// Formato, não entregabilidade: pega erro de digitação ("fulano@", "a b@c").
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RESTAURANT_NAME = 120;
const MAX_EMAIL = 254;
const MAX_ADDRESS = 300;

/** Pino no mapa: os dois números dentro da faixa, ou os dois nulos. */
function parseLocation(
  lat: unknown,
  lng: unknown,
): { latitude: number | null; longitude: number | null } {
  const absent = (v: unknown) => v === undefined || v === null;
  if (absent(lat) && absent(lng)) return { latitude: null, longitude: null };
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    throw new InvalidMenuError("location_invalid", "latitude");
  }
  return { latitude: lat, longitude: lng };
}

/** Texto opcional: aparado; vazio vira `null`. */
function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
}

function parseOpeningHours(raw: unknown): OpeningHours {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidMenuError("opening_hours_invalid", "openingHours");
  }

  const input = raw as Record<string, unknown>;
  const result: OpeningHours = {};

  for (const [day, value] of Object.entries(input)) {
    if (!(DAY_KEYS as readonly string[]).includes(day)) {
      throw new InvalidMenuError("opening_hours_invalid", "openingHours");
    }
    if (!Array.isArray(value)) {
      throw new InvalidMenuError("opening_hours_invalid", "openingHours");
    }

    const intervals: DayInterval[] = value.map((entry) => {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string" ||
        typeof entry[1] !== "string" ||
        !TIME_RE.test(entry[0]) ||
        !TIME_RE.test(entry[1])
      ) {
        throw new InvalidMenuError("opening_hours_invalid", "openingHours");
      }
      return [entry[0], entry[1]];
    });

    result[day as keyof OpeningHours] = intervals;
  }

  return result;
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Puro — valida a entrada da UI antes de tocar no banco. */
export function parseStoreSettings(
  input: unknown,
): Omit<StoreSettings, "updatedAt"> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const timezone = typeof raw.timezone === "string" ? raw.timezone.trim() : "";
  if (timezone.length === 0 || !isValidTimezone(timezone)) {
    throw new InvalidMenuError("timezone_required", "timezone");
  }

  const openingHours = parseOpeningHours(raw.openingHours);

  const paused = raw.paused === true;

  const minOrderCents = raw.minOrderCents;
  if (
    typeof minOrderCents !== "number" ||
    !Number.isInteger(minOrderCents) ||
    minOrderCents < 0
  ) {
    throw new InvalidMenuError("min_order_invalid", "minOrderCents");
  }

  const estimatedMinutes = raw.estimatedMinutes;
  if (
    typeof estimatedMinutes !== "number" ||
    !Number.isInteger(estimatedMinutes) ||
    estimatedMinutes <= 0
  ) {
    throw new InvalidMenuError("estimated_minutes_invalid", "estimatedMinutes");
  }

  const pickupEnabled = raw.pickupEnabled === true;
  const deliveryEnabled = raw.deliveryEnabled === true;
  if (!pickupEnabled && !deliveryEnabled) {
    throw new InvalidMenuError("fulfillment_required", "pickupEnabled");
  }

  const paymentMethods = Array.isArray(raw.paymentMethods)
    ? [...new Set(raw.paymentMethods)]
    : [];
  if (paymentMethods.length === 0 || !paymentMethods.every(isPaymentMethod)) {
    throw new InvalidMenuError("unknown_payment_method", "paymentMethods");
  }

  const pixKey =
    typeof raw.pixKey === "string" && raw.pixKey.trim().length > 0
      ? raw.pixKey.trim()
      : null;
  const ownerWhatsapp =
    typeof raw.ownerWhatsapp === "string" && raw.ownerWhatsapp.trim().length > 0
      ? raw.ownerWhatsapp.trim()
      : null;

  // Só dígitos: aceita "+55 (61) 99999-0000" colado do WhatsApp e guarda limpo.
  let whatsappNumber: string | null = null;
  if (typeof raw.whatsappNumber === "string" && raw.whatsappNumber.trim()) {
    const digits = raw.whatsappNumber.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      throw new InvalidMenuError("whatsapp_number_invalid", "whatsappNumber");
    }
    whatsappNumber = digits;
  }

  const restaurantName = optionalText(raw.restaurantName);
  if (restaurantName && restaurantName.length > MAX_RESTAURANT_NAME) {
    throw new InvalidMenuError("restaurant_name_too_long", "restaurantName");
  }

  const contactEmail = optionalText(raw.contactEmail);
  if (
    contactEmail &&
    (contactEmail.length > MAX_EMAIL || !EMAIL_RE.test(contactEmail))
  ) {
    throw new InvalidMenuError("email_invalid", "contactEmail");
  }

  const address = optionalText(raw.address);
  if (address && address.length > MAX_ADDRESS) {
    throw new InvalidMenuError("address_too_long", "address");
  }

  const logoUrl = optionalText(raw.logoUrl);

  const { latitude, longitude } = parseLocation(raw.latitude, raw.longitude);

  return {
    timezone,
    openingHours,
    paused,
    minOrderCents,
    estimatedMinutes,
    pickupEnabled,
    deliveryEnabled,
    paymentMethods: paymentMethods as PaymentMethod[],
    pixKey,
    ownerWhatsapp,
    whatsappNumber,
    restaurantName,
    logoUrl,
    contactEmail,
    address,
    latitude,
    longitude,
  };
}

export function parseZoneInput(input: unknown): Omit<DeliveryZone, "id"> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const neighborhood =
    typeof raw.neighborhood === "string" ? raw.neighborhood.trim() : "";
  if (neighborhood.length === 0) {
    throw new InvalidMenuError("neighborhood_required", "neighborhood");
  }

  const feeCents = raw.feeCents;
  if (
    typeof feeCents !== "number" ||
    !Number.isInteger(feeCents) ||
    feeCents < 0
  ) {
    throw new InvalidMenuError("fee_invalid", "feeCents");
  }

  const active = raw.active !== false;

  return { neighborhood, feeCents, active };
}
