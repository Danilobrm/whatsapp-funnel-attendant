import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, X } from 'lucide-react';

import { useI18n } from '../../../i18n/index.tsx';
import { formatBRL } from '../../../lib/money.ts';
import { canCancel } from '../orderView.ts';

import type { Order } from '../../../api/orders/orders.ts';

interface OrderDrawerProps {
  order: Order;
  /** Falha da última ação (ex.: cancelar), já traduzida. */
  error?: string | null;
  onClose: () => void;
  onCancelOrder: () => Promise<void> | void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="text-right text-fg">{children}</span>
    </div>
  );
}

export default function OrderDrawer({
  order,
  error,
  onClose,
  onCancelOrder,
}: OrderDrawerProps) {
  const { t, locale } = useI18n();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(order.createdAt));
  const paymentKey = `orders.payment.${order.paymentMethod}`;
  const payment =
    t(paymentKey) === paymentKey ? order.paymentMethod : t(paymentKey);
  const address = order.address
    ? [
        [order.address.street, order.address.number].filter(Boolean).join(', '),
        order.address.complement,
        order.neighborhood,
        order.address.reference,
      ]
        .filter(Boolean)
        .join(' — ')
    : null;

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${t('orders.drawer.title')} #${order.number}`}
        className="relative z-10 flex h-dvh w-full max-w-md flex-col border-l border-line bg-surface shadow-lg"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-4 md:px-6 md:py-5">
          <div>
            <h2 className="text-xl font-semibold text-fg">
              {t('orders.drawer.title')} #{order.number}
            </h2>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              {t(`orders.status.${order.status}`)} ·{' '}
              {t(`orders.fulfillment.${order.fulfillment}`)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('orders.drawer.close')}
            className="inline-flex h-10 w-10 flex-none md:h-8 md:w-8 items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-fg"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger"
            >
              {error}
            </p>
          )}
          <section className="flex flex-col gap-2">
            <Row label={t('orders.drawer.customer')}>
              {order.customerName}
              {order.customerPhone && (
                <span className="block text-[13px] text-fg-muted">
                  {order.customerPhone}
                </span>
              )}
            </Row>
            <Row label={t('orders.drawer.createdAt')}>{time}</Row>
            {address && <Row label={t('orders.drawer.address')}>{address}</Row>}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-fg">
              {t('orders.drawer.items')}
            </h3>
            <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {order.items.map((item, index) => (
                <li key={index} className="flex flex-col gap-0.5 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="font-medium text-fg">
                      {item.quantity}× {item.name}
                      {item.sizeName && (
                        <span className="font-normal text-fg-muted">
                          {' '}
                          ({item.sizeName})
                        </span>
                      )}
                    </span>
                    <span className="flex-none text-fg">
                      {formatBRL(item.unitPriceCents * item.quantity)}
                    </span>
                  </div>
                  {item.options.map((option, i) => (
                    <span key={i} className="text-[13px] text-fg-muted">
                      + {option.group}: {option.name}
                    </span>
                  ))}
                  {item.notes && (
                    <span className="text-[13px] text-warning-fg">
                      {t('orders.drawer.itemNotes')} {item.notes}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {order.notes && (
            <section>
              <h3 className="mb-1 text-sm font-medium text-fg">
                {t('orders.drawer.notes')}
              </h3>
              <p className="rounded-xl bg-warning-bg px-3 py-2 text-sm text-warning-fg">
                {order.notes}
              </p>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <Row label={t('orders.drawer.subtotal')}>
              {formatBRL(order.subtotalCents)}
            </Row>
            {order.fulfillment === 'delivery' && (
              <Row label={t('orders.drawer.fee')}>
                {formatBRL(order.feeCents)}
              </Row>
            )}
            <div className="flex items-center justify-between border-t border-line pt-2 text-base font-semibold text-fg">
              <span>{t('orders.drawer.total')}</span>
              <span>{formatBRL(order.totalCents)}</span>
            </div>
            <Row label={t('orders.drawer.payment')}>{payment}</Row>
            {order.changeForCents !== null && (
              <Row label={t('orders.drawer.changeFor')}>
                {formatBRL(order.changeForCents)}
              </Row>
            )}
          </section>

          {order.rejectReason && (
            <Row label={t('orders.drawer.rejectReason')}>
              {order.rejectNote ??
                t(`orders.reject.reasons.${order.rejectReason}`)}
            </Row>
          )}

          {order.conversationId !== null && (
            <Link
              to="/admin/simulator"
              className="flex items-center gap-2 text-sm font-medium text-accent hover:underline"
            >
              <MessageCircle
                className="h-4 w-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {t('orders.drawer.viewConversation')}
            </Link>
          )}
        </div>

        {canCancel(order.status) && (
          <footer className="border-t border-line px-4 py-3 md:px-6 md:py-4">
            {confirmingCancel ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-fg">
                  {t('orders.actions.cancelQuestion')}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingCancel(false)}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-fg-muted transition hover:bg-hover hover:text-fg"
                  >
                    {t('orders.actions.keep')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onCancelOrder()}
                    className="rounded-xl bg-danger px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90"
                  >
                    {t('orders.actions.confirmCancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingCancel(true)}
                className="text-sm font-medium text-danger hover:underline"
              >
                {t('orders.actions.cancel')}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
