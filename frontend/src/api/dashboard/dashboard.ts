import { request } from '../client/client.ts';

export interface DailyTotal {
  /** `YYYY-MM-DD` no fuso da loja. */
  day: string;
  orders: number;
  revenueCents: number;
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
    active: number;
  };
  last7Days: DailyTotal[];
  topItems: TopItem[];
  fulfillment: BreakdownEntry[];
  payment: BreakdownEntry[];
  store: {
    open: boolean;
    paused: boolean;
    nextOpeningAt: string | null;
  };
  menuFunnel: MenuFunnel;
}

export function fetchDashboard(): Promise<{ dashboard: Dashboard }> {
  return request('/api/dashboard');
}
