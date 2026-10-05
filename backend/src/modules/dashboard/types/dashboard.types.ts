export interface DailyTotal {
  /** `YYYY-MM-DD` no fuso da loja. */
  day: string;
  /** Pedidos válidos (tudo menos recusado/cancelado). */
  orders: number;
  revenueCents: number;
  /** Recusados + cancelados. */
  rejected: number;
}

export interface TopItem {
  name: string;
  quantity: number;
  revenueCents: number;
}

export interface BreakdownEntry {
  key: string;
  count: number;
}

export interface StoreStatus {
  open: boolean;
  paused: boolean;
  /** ISO. `null` quando aberta, pausada ou sem horário nos próximos 14 dias. */
  nextOpeningAt: string | null;
}

/** Funil do cardápio em link (7 dias): conversas distintas em cada passo. */
export interface MenuFunnel {
  sent: number;
  opened: number;
  confirmed: number;
  ordered: number;
}

export interface Dashboard {
  timezone: string;
  today: {
    orders: number;
    revenueCents: number;
    ticketCents: number;
    rejected: number;
    /** Pedidos em andamento agora (qualquer dia). */
    active: number;
  };
  last7Days: DailyTotal[];
  topItems: TopItem[];
  fulfillment: BreakdownEntry[];
  payment: BreakdownEntry[];
  store: StoreStatus;
  menuFunnel: MenuFunnel;
}
