import { Bike, ShoppingBag } from 'lucide-react';

import { useT } from '../../../i18n/index.tsx';
import { formatBRL } from '../../../lib/money.ts';
import {
  elapsedMinutes,
  isLate,
  itemsSummary,
  primaryAction,
} from '../orderView.ts';

import type { Order, OrderStatus } from '../../../api/orders/orders.ts';

interface OrderCardProps {
  order: Order;
  now: number;
  busy?: boolean;
  onOpen: () => void;
  onAdvance: (to: OrderStatus) => void;
  onReject: () => void;
}

export function OrderCardSkeleton() {
  return (
    <div
      aria-busy="true"
      data-testid="order-card-skeleton"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex items-center justify-between">
        <div className="h-6 w-14 animate-pulse rounded bg-skeleton" />
        <div className="h-4 w-12 animate-pulse rounded bg-skeleton" />
      </div>
      <div className="h-4 w-32 animate-pulse rounded bg-skeleton" />
      <div className="h-3 w-full animate-pulse rounded bg-skeleton" />
      <div className="flex items-center justify-between">
        <div className="h-5 w-20 animate-pulse rounded bg-skeleton" />
        <div className="h-8 w-24 animate-pulse rounded-xl bg-skeleton" />
      </div>
    </div>
  );
}

const FINISHED: readonly OrderStatus[] = ['completed', 'rejected', 'cancelled'];

export default function OrderCard({
  order,
  now,
  busy = false,
  onOpen,
  onAdvance,
  onReject,
}: OrderCardProps) {
  const t = useT();
  const late = isLate(order, now);
  const minutes = elapsedMinutes(order, now);
  const action = primaryAction(order);
  const finished = FINISHED.includes(order.status);
  const FulfillmentIcon = order.fulfillment === 'delivery' ? Bike : ShoppingBag;

  return (
    // Clique abre o detalhe; pelo teclado, o número do pedido é um botão.
    <article
      onClick={onOpen}
      data-late={late || undefined}
      className={`flex cursor-pointer flex-col gap-2 rounded-2xl border bg-surface p-4 transition ${
        late ? 'border-danger' : 'border-line hover:border-line-strong'
      } ${finished ? 'opacity-70' : ''}`}
    >
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="text-xl font-semibold text-fg"
        >
          #{order.number}
        </button>
        <span
          className={`text-[13px] ${late ? 'font-medium text-danger' : 'text-fg-subtle'}`}
        >
          {minutes === 0
            ? t('orders.justNow')
            : t('orders.minutesAgo').replace('{n}', String(minutes))}
        </span>
      </header>

      <p className="flex items-center gap-2 text-sm font-medium text-fg">
        <span className="truncate">{order.customerName}</span>
        <span className="ml-auto flex flex-none items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-[11px] text-fg-muted">
          <FulfillmentIcon
            className="h-3 w-3"
            strokeWidth={2}
            aria-hidden="true"
          />
          {t(`orders.fulfillment.${order.fulfillment}`)}
        </span>
      </p>

      <p className="line-clamp-2 text-[13px] text-fg-muted">
        {itemsSummary(order)}
      </p>

      <footer className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-semibold text-fg">
          {formatBRL(order.totalCents)}
        </span>

        {finished ? (
          <span className="rounded-full bg-hover px-2 py-0.5 text-[11px] text-fg-subtle">
            {t(`orders.status.${order.status}`)}
          </span>
        ) : (
          <div className="flex gap-2">
            {order.status === 'pending' && (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  onReject();
                }}
                className="rounded-xl border border-line px-3 py-2.5 text-[13px] md:py-1.5 font-medium text-fg-muted transition hover:border-danger-border hover:text-danger disabled:opacity-60"
              >
                {t('orders.actions.reject')}
              </button>
            )}
            {action && (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  onAdvance(action.to);
                }}
                className="rounded-xl bg-accent px-3 py-2.5 text-[13px] md:py-1.5 font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-60"
              >
                {t(action.labelKey)}
              </button>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}
