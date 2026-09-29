import type { PaymentMethod } from "../../store/types/store.types.js";
import type { Fulfillment, OrderAddress } from "./order.types.js";

/**
 * Carrinho de uma conversa. Linhas guardam SÓ ids e quantidade: o preço é
 * recalculado do cardápio (`priceCart`), então "esgotou entre a adição e a
 * confirmação" é detectado em vez de vender pelo preço velho.
 */
export interface CartLine {
  itemId: number;
  sizeId: number | null;
  optionIds: number[];
  quantity: number;
  notes: string | null;
}

/** `open` = montando; `awaiting_confirmation` = resumo enviado, esperando o "sim". */
export const CART_STATUSES = ["open", "awaiting_confirmation"] as const;
export type CartStatus = (typeof CART_STATUSES)[number];

/** Endereço do carrinho. O bairro vem junto: é ele que resolve a zona/taxa. */
export interface CartAddress extends OrderAddress {
  neighborhood: string | null;
}

export interface Cart {
  items: CartLine[];
  fulfillment: Fulfillment | null;
  address: CartAddress | null;
  /** Zona de entrega resolvida pelo bairro (`set_fulfillment`). */
  zoneId: number | null;
  paymentMethod: PaymentMethod | null;
  changeForCents: number | null;
  notes: string | null;
  status: CartStatus;
  /** Hash do carrinho quando o resumo foi enviado. `null` = nenhum resumo válido. */
  summaryHash: string | null;
  updatedAt: string | null;
}

/** Carrinho inativo por mais que isto é descartado na leitura. */
export const CART_TTL_MS = 3 * 60 * 60 * 1000;

export function emptyCart(): Cart {
  return {
    items: [],
    fulfillment: null,
    address: null,
    zoneId: null,
    paymentMethod: null,
    changeForCents: null,
    notes: null,
    status: "open",
    summaryHash: null,
    updatedAt: null,
  };
}

export function isCartExpired(updatedAt: string | null, now: Date): boolean {
  if (updatedAt === null) return false;
  return now.getTime() - new Date(updatedAt).getTime() > CART_TTL_MS;
}
