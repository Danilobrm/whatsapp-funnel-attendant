import type { Order, OrderStatus } from '../../api/orders/orders.ts';

/** Colunas do quadro do balcão, na ordem de exibição. */
export const BOARD_COLUMNS = [
  'pending',
  'preparing',
  'dispatched',
  'done',
] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

const COLUMN_OF: Record<OrderStatus, BoardColumn> = {
  pending: 'pending',
  accepted: 'preparing',
  out_for_delivery: 'dispatched',
  ready_for_pickup: 'dispatched',
  completed: 'done',
  rejected: 'done',
  cancelled: 'done',
};

export function columnOf(status: OrderStatus): BoardColumn {
  return COLUMN_OF[status];
}

/** Pedido novo parado há mais que isso fica vermelho no quadro. */
export const LATE_AFTER_MS = 5 * 60_000;

export function isLate(
  order: Pick<Order, 'status' | 'createdAt'>,
  now: number,
): boolean {
  return (
    order.status === 'pending' &&
    now - Date.parse(order.createdAt) > LATE_AFTER_MS
  );
}

export function elapsedMinutes(
  order: Pick<Order, 'createdAt'>,
  now: number,
): number {
  return Math.max(0, Math.floor((now - Date.parse(order.createdAt)) / 60_000));
}

export interface OrderAction {
  to: OrderStatus;
  /** Chave i18n do rótulo do botão. */
  labelKey: string;
}

/** O próximo passo "feliz" do pedido (botão principal do cartão). Espelha `order.status.ts` do backend. */
export function primaryAction(
  order: Pick<Order, 'status' | 'fulfillment'>,
): OrderAction | null {
  switch (order.status) {
    case 'pending':
      return { to: 'accepted', labelKey: 'orders.actions.accept' };
    case 'accepted':
      return order.fulfillment === 'delivery'
        ? { to: 'out_for_delivery', labelKey: 'orders.actions.dispatch' }
        : { to: 'ready_for_pickup', labelKey: 'orders.actions.ready' };
    case 'out_for_delivery':
    case 'ready_for_pickup':
      return { to: 'completed', labelKey: 'orders.actions.complete' };
    default:
      return null;
  }
}

export function canCancel(status: OrderStatus): boolean {
  return status === 'pending' || status === 'accepted';
}

/** "2× X-Tudo, 1× Refrigerante 2L" — resumo de uma linha para o cartão. */
export function itemsSummary(order: Pick<Order, 'items'>): string {
  return order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
}
