export const ORDER_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "out_for_delivery",
  "ready_for_pickup",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const FULFILLMENTS = ["delivery", "pickup"] as const;
export type Fulfillment = (typeof FULFILLMENTS)[number];

export const REJECT_REASONS = [
  "sold_out",
  "out_of_area",
  "closing",
  "other",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export interface OrderItemOption {
  group: string;
  name: string;
  priceCents: number;
}

/** Snapshot do item no momento do pedido — não aponta para o cardápio. */
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

/** O que quem cria o pedido informa. Número, status e datas são do sistema. */
export type NewOrderInput = Pick<
  Order,
  | "conversationId"
  | "customerName"
  | "customerPhone"
  | "fulfillment"
  | "address"
  | "neighborhood"
  | "paymentMethod"
  | "changeForCents"
  | "subtotalCents"
  | "feeCents"
  | "totalCents"
  | "notes"
  | "items"
> & {
  /** Cliente cadastrado (`customers`). `null`/ausente = só o snapshot de nome/telefone. */
  customerId?: number | null;
};

export interface TransitionInput {
  to: OrderStatus;
  reason?: RejectReason;
  note?: string | null;
}

export type OrderEvent =
  | { type: "order_created"; order: Order }
  | { type: "order_updated"; order: Order };
