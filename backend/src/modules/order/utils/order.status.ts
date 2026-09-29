import type { Fulfillment, OrderStatus } from "../types/order.types.js";

/**
 * Máquina de estados do pedido. Pura: quem grava é o service, com
 * `WHERE status = <de>` para dois cliques simultâneos não passarem os dois.
 *
 *   pending  → accepted | rejected | cancelled
 *   accepted → out_for_delivery (entrega) | ready_for_pickup (retirada) | cancelled
 *   out_for_delivery | ready_for_pickup → completed
 */
const TERMINAL: readonly OrderStatus[] = ["rejected", "cancelled", "completed"];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL.includes(status);
}

export function nextStatuses(
  from: OrderStatus,
  fulfillment: Fulfillment,
): OrderStatus[] {
  switch (from) {
    case "pending":
      return ["accepted", "rejected", "cancelled"];
    case "accepted":
      return [
        fulfillment === "delivery" ? "out_for_delivery" : "ready_for_pickup",
        "cancelled",
      ];
    case "out_for_delivery":
    case "ready_for_pickup":
      return ["completed"];
    default:
      return [];
  }
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  fulfillment: Fulfillment,
): boolean {
  return nextStatuses(from, fulfillment).includes(to);
}
