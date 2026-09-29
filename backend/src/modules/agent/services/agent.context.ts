import { getPublishedMenu } from "../../menu/services/menu.service.js";
import { findLastOrderForCustomer } from "../../order/repositories/order.repository.js";
import {
  dayNumber,
  describeNextOpening,
  isOpenAt,
  nextOpening,
} from "../../store/utils/store.hours.js";
import { getStoreSettings } from "../../store/services/store.service.js";
import { buildMenuSummary } from "../utils/agent.prompt.js";

import type { Customer } from "../../customer/types/customer.types.js";
import type { Order } from "../../order/types/order.types.js";
import type { StoreSettings } from "../../store/types/store.types.js";
import type { TenantId } from "../../tenants/types/tenant.types.js";
import type {
  AgentContext,
  CustomerContext,
  LastOrderContext,
  StoreContext,
} from "../utils/agent.prompt.js";

/** "terça-feira, 29/09, 19:32" no fuso da loja. */
export function formatStoreNow(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

/** "hoje", "ontem", "há 3 dias" ou o dia da semana, no fuso da loja. */
export function describePastDay(
  date: Date,
  now: Date,
  timezone: string,
): string {
  const diff = dayNumber(now, timezone) - dayNumber(date, timezone);
  if (diff <= 0) return "hoje";
  if (diff === 1) return "ontem";
  if (diff < 7) {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      weekday: "long",
    }).format(date);
  }
  return `há ${diff} dias`;
}

export function storeContext(settings: StoreSettings, now: Date): StoreContext {
  const open = isOpenAt(settings, now);
  const next = open || settings.paused ? null : nextOpening(settings, now);
  return {
    open,
    paused: settings.paused,
    nextOpeningText: next
      ? describeNextOpening(next, now, settings.timezone)
      : null,
    nowText: formatStoreNow(now, settings.timezone),
  };
}

function lastOrderContext(
  order: Order,
  now: Date,
  timezone: string,
): LastOrderContext {
  return {
    number: order.number,
    whenText: describePastDay(new Date(order.createdAt), now, timezone),
    lines: order.items.map((i) => {
      const name = i.sizeName ? `${i.name} ${i.sizeName}` : i.name;
      const options = i.options.map((o) => o.name).join(" + ");
      return `${i.quantity}x ${name}${options ? ` (${options})` : ""}`;
    }),
  };
}

async function customerContext(
  tenantId: TenantId,
  customer: Customer | null,
  contactName: string | null,
  now: Date,
  timezone: string,
): Promise<CustomerContext | null> {
  if (customer === null) return null;
  const last = await findLastOrderForCustomer(tenantId, customer.id);
  const a = customer.lastAddress;
  return {
    name: customer.name ?? contactName,
    lastAddress: a
      ? [
          [a.street, a.number].filter(Boolean).join(", "),
          a.complement,
          a.neighborhood,
        ]
          .filter(Boolean)
          .join(" - ")
      : null,
    lastOrder: last ? lastOrderContext(last, now, timezone) : null,
  };
}

/** Tudo que o prompt precisa saber da loja, do cardápio e do cliente. */
export async function loadPromptContext(
  tenantId: TenantId,
  customer: Customer | null,
  contactName: string | null,
  now: Date,
): Promise<Pick<AgentContext, "store" | "menuSummary" | "customer">> {
  const [settings, menu] = await Promise.all([
    getStoreSettings(tenantId),
    getPublishedMenu(tenantId),
  ]);
  return {
    store: storeContext(settings, now),
    menuSummary: buildMenuSummary(menu),
    customer: await customerContext(
      tenantId,
      customer,
      contactName,
      now,
      settings.timezone,
    ),
  };
}
