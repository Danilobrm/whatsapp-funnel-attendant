import { countMenuFunnel } from "../../menulink/repositories/menuLink.repository.js";
import { startOfDayInZone } from "../../order/utils/order.time.js";
import { getStoreSettings } from "../../store/services/store.service.js";
import { isOpenAt, nextOpening } from "../../store/utils/store.hours.js";
import {
  breakdown,
  countActive,
  dailyTotals,
  topItems,
} from "../repositories/dashboard.repository.js";
import { dayKeyInZone, fillDays, ticketCents } from "../utils/dashboard.stats.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { Dashboard } from "../types/dashboard.types.js";

export const DASHBOARD_DAYS = 7;
export const TOP_ITEMS_LIMIT = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resumo do negócio para a primeira aba do painel. Todos os "dias" são do
 * fuso da loja: às 22h em São Paulo o pedido ainda conta para hoje, mesmo já
 * sendo amanhã em UTC.
 */
export async function getDashboard(tenantId: TenantId): Promise<Dashboard> {
  const settings = await getStoreSettings(tenantId);
  const now = new Date();
  const tz = settings.timezone;
  // Meio-dia de 6 dias atrás → início daquele dia no fuso da loja. Andar a
  // partir do meio-dia evita cair no dia errado por causa do offset.
  const since = startOfDayInZone(
    new Date(
      startOfDayInZone(now, tz).getTime() -
        (DASHBOARD_DAYS - 1) * DAY_MS +
        DAY_MS / 2,
    ),
    tz,
  );

  const [daily, top, fulfillment, payment, active, menuFunnel] =
    await Promise.all([
      dailyTotals(tenantId, since, tz),
      topItems(tenantId, since, TOP_ITEMS_LIMIT),
      breakdown(tenantId, since, "fulfillment"),
      breakdown(tenantId, since, "payment_method"),
      countActive(tenantId),
      countMenuFunnel(tenantId, since),
    ]);

  const last7Days = fillDays(daily, dayKeyInZone(now, tz), DASHBOARD_DAYS);
  const today = last7Days[last7Days.length - 1] ?? {
    day: "",
    orders: 0,
    revenueCents: 0,
    rejected: 0,
  };
  const hours = {
    timezone: tz,
    openingHours: settings.openingHours,
    paused: settings.paused,
  };

  return {
    timezone: tz,
    today: {
      orders: today.orders,
      revenueCents: today.revenueCents,
      ticketCents: ticketCents(today.revenueCents, today.orders),
      rejected: today.rejected,
      active,
    },
    last7Days,
    topItems: top,
    fulfillment,
    payment,
    store: {
      open: isOpenAt(hours, now),
      paused: settings.paused,
      nextOpeningAt: nextOpening(hours, now)?.toISOString() ?? null,
    },
    menuFunnel,
  };
}
