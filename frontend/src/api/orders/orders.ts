import { request } from '../client/client.ts';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'out_for_delivery'
  | 'ready_for_pickup'
  | 'completed'
  | 'cancelled';

export type Fulfillment = 'delivery' | 'pickup';

export type RejectReason = 'sold_out' | 'out_of_area' | 'closing' | 'other';

export const REJECT_REASONS: RejectReason[] = [
  'sold_out',
  'out_of_area',
  'closing',
  'other',
];

export interface OrderItemOption {
  group: string;
  name: string;
  priceCents: number;
}

export interface OrderItem {
  name: string;
  sizeName: string | null;
  unitPriceCents: number;
  quantity: number;
  options: OrderItemOption[];
  notes: string | null;
}

export interface OrderAddress {
  street: string;
  number: string | null;
  complement: string | null;
  reference: string | null;
}

export interface Order {
  id: number;
  number: number;
  conversationId: number | null;
  customerName: string;
  customerPhone: string | null;
  status: OrderStatus;
  fulfillment: Fulfillment;
  address: OrderAddress | null;
  neighborhood: string | null;
  paymentMethod: string;
  changeForCents: number | null;
  subtotalCents: number;
  feeCents: number;
  totalCents: number;
  notes: string | null;
  rejectReason: RejectReason | null;
  rejectNote: string | null;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  items: OrderItem[];
}

export interface TransitionBody {
  to: OrderStatus;
  reason?: RejectReason;
  note?: string;
}

/** 404/409/422 do backend — `code` decide a mensagem (`orders.errors.<code>`). */
export class OrderRejectedError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'OrderRejectedError';
    this.code = code;
  }
}

const toRejected = (payload: unknown) =>
  new OrderRejectedError(
    (payload as { code?: string } | null)?.code ?? 'unknown',
  );

const onStatus = { 404: toRejected, 409: toRejected, 422: toRejected };

export function fetchOrders(): Promise<{ orders: Order[] }> {
  return request('/api/orders/orders.ts');
}

export function fetchOrder(id: number): Promise<{ order: Order }> {
  return request(`/api/orders/${id}`, { onStatus });
}

export function transitionOrder(
  id: number,
  body: TransitionBody,
): Promise<{ order: Order }> {
  return request(`/api/orders/${id}/transition`, {
    method: 'POST',
    body,
    onStatus,
  });
}

/** Só existe em dev — em produção o backend responde 404. */
export function createSampleOrder(): Promise<{ order: Order }> {
  return request('/api/orders/dev-sample', { method: 'POST', onStatus });
}
