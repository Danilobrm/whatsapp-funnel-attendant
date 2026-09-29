import type { OrderStatus } from "../types/order.types.js";

/** Pedido inexistente OU de outro tenant — os dois viram o mesmo 404. */
export class OrderNotFoundError extends Error {
  readonly code = "order_not_found";

  constructor() {
    super("order_not_found");
    this.name = "OrderNotFoundError";
  }
}

/**
 * Transição fora da máquina de estados, ou o pedido mudou de status entre a
 * tela e o clique (outra aba aceitou antes). HTTP 409: o pedido existe, o
 * estado atual é que não permite.
 */
export class InvalidTransitionError extends Error {
  readonly code = "invalid_transition";
  readonly from: OrderStatus;
  readonly to: OrderStatus;

  constructor(from: OrderStatus, to: OrderStatus) {
    super(`invalid_transition:${from}->${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export type InvalidOrderCode =
  | "invalid_id"
  | "invalid_status"
  | "reject_reason_required"
  | "reject_note_required"
  | "items_required"
  | "customer_name_required"
  | "menu_empty";

/** Entrada inválida para criar/transicionar pedido → 422. */
export class InvalidOrderError extends Error {
  readonly code: InvalidOrderCode;
  readonly field: string;

  constructor(code: InvalidOrderCode, field: string) {
    super(`invalid_order:${code}`);
    this.name = "InvalidOrderError";
    this.code = code;
    this.field = field;
  }
}
