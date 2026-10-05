import { useCallback, useState } from 'react';
import { ClipboardList, FlaskConical, Volume2, VolumeX } from 'lucide-react';

import {
  createSampleOrder,
  OrderRejectedError,
  type Order,
  type OrderStatus,
  type RejectReason,
} from '../../api/orders/orders.ts';
import OrderCard, {
  OrderCardSkeleton,
} from '../../components/orders/OrderCard/OrderCard.tsx';
import OrderDrawer from '../../components/orders/OrderDrawer/OrderDrawer.tsx';
import RejectDialog from '../../components/orders/RejectDialog/RejectDialog.tsx';
import {
  BOARD_COLUMNS,
  columnOf,
  type BoardColumn,
} from '../../components/orders/orderView.ts';
import { useNewOrderAlert } from '../../hooks/useNewOrderAlert/useNewOrderAlert.ts';
import { useNow } from '../../hooks/useNow/useNow.ts';
import {
  useOrdersBoard,
  type StreamConnection,
} from '../../hooks/useOrdersBoard/useOrdersBoard.ts';
import { useT } from '../../i18n/index.tsx';

const CONNECTION_DOT: Record<StreamConnection, string> = {
  live: 'bg-success',
  reconnecting: 'bg-warning',
  connecting: 'bg-fg-subtle',
};

/** Encerrados mais recentes primeiro; em andamento, o mais antigo primeiro (fila). */
function sortForColumn(column: BoardColumn, orders: Order[]): Order[] {
  const byCreated = [...orders].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  return column === 'done' ? byCreated.reverse() : byCreated;
}

export default function Orders() {
  const t = useT();
  const now = useNow(30_000);
  const alert = useNewOrderAlert(
    (count) => `(${count}) ${t('orders.newOrderTitle')}`,
  );
  const { orders, loading, loadError, connection, transition, reload } =
    useOrdersBoard({
      onOrderCreated: alert.notify,
    });

  const [activeColumn, setActiveColumn] = useState<
    (typeof BOARD_COLUMNS)[number]
  >(BOARD_COLUMNS[0]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const errorText = useCallback(
    (err: unknown) => {
      if (err instanceof OrderRejectedError) {
        const key = `orders.errors.${err.code}`;
        const text = t(key);
        if (text !== key) return text;
      }
      return t('orders.errors.generic');
    },
    [t],
  );

  /** Transiciona; devolve o texto de erro (já traduzido) ou `null` no sucesso. */
  async function run(
    id: number,
    to: OrderStatus,
    extra: { reason?: RejectReason; note?: string } = {},
  ): Promise<string | null> {
    setActionError(null);
    setBusyId(id);
    try {
      await transition(id, { to, ...extra });
      return null;
    } catch (err) {
      // Outra tela mudou o pedido antes: a lista local está velha.
      if (
        err instanceof OrderRejectedError &&
        err.code === 'invalid_transition'
      )
        void reload();
      const text = errorText(err);
      setActionError(text);
      return text;
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(reason: RejectReason, note: string | null) {
    if (rejectingId === null) return;
    setRejectError(null);
    const error = await run(rejectingId, 'rejected', {
      reason,
      ...(note ? { note } : {}),
    });
    if (error) setRejectError(error);
    else setRejectingId(null);
  }

  async function handleSample() {
    setActionError(null);
    try {
      await createSampleOrder();
    } catch (err) {
      setActionError(errorText(err));
    }
  }

  const openOrder = orders.find((o) => o.id === openId) ?? null;
  const rejectingOrder = orders.find((o) => o.id === rejectingId) ?? null;

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto flex w-full flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
        <header className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-hover text-fg">
            <ClipboardList className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-medium text-fg">{t('orders.title')}</h1>
            <p className="text-sm text-fg-muted">{t('orders.subtitle')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              role="status"
              className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[13px] text-fg-muted"
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${CONNECTION_DOT[connection]} ${
                  connection === 'live' ? 'animate-pulse' : ''
                }`}
              />
              {t(`orders.${connection}`)}
            </span>

            <button
              type="button"
              onClick={alert.enableSound}
              disabled={alert.soundEnabled}
              aria-pressed={alert.soundEnabled}
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] font-medium text-fg transition hover:border-line-strong disabled:text-fg-muted"
            >
              {alert.soundEnabled ? (
                <Volume2
                  className="h-3.5 w-3.5"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              ) : (
                <VolumeX
                  className="h-3.5 w-3.5"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              )}
              {alert.soundEnabled
                ? t('orders.soundOn')
                : t('orders.enableSound')}
            </button>

            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={() => void handleSample()}
                className="flex items-center gap-1.5 rounded-full border border-dashed border-line px-3 py-1.5 text-[13px] font-medium text-fg-muted transition hover:border-line-strong hover:text-fg"
              >
                <FlaskConical
                  className="h-3.5 w-3.5"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                {t('orders.sample')}
              </button>
            )}
          </div>
        </header>

        {loadError && (
          <p className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            {t('orders.loadError')}
          </p>
        )}
        {actionError && rejectingId === null && openId === null && (
          <p
            role="alert"
            className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger"
          >
            {actionError}
          </p>
        )}

        <div
          role="tablist"
          aria-label={t('orders.title')}
          className="grid grid-cols-4 gap-1 rounded-2xl bg-canvas-alt p-1 md:hidden"
        >
          {BOARD_COLUMNS.map((column) => {
            const count = orders.filter(
              (o) => columnOf(o.status) === column,
            ).length;
            const selected = column === activeColumn;
            return (
              <button
                key={column}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveColumn(column)}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-center transition ${
                  selected
                    ? 'bg-surface text-fg shadow-sm'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                <span className="text-base font-semibold leading-none">
                  {loading ? '–' : count}
                </span>
                <span className="text-[11px] font-medium leading-tight">
                  {t(`orders.columns.${column}`)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BOARD_COLUMNS.map((column) => {
            const items = sortForColumn(
              column,
              orders.filter((o) => columnOf(o.status) === column),
            );
            return (
              <section
                key={column}
                aria-label={t(`orders.columns.${column}`)}
                className={`${column === activeColumn ? 'flex' : 'hidden md:flex'} min-w-0 flex-col gap-3 rounded-2xl bg-canvas-alt p-3`}
              >
                <header className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-fg">
                    {t(`orders.columns.${column}`)}
                  </h2>
                  {!loading && (
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[12px] font-medium text-fg-muted">
                      {items.length}
                    </span>
                  )}
                </header>

                {loading ? (
                  <>
                    <OrderCardSkeleton />
                    <OrderCardSkeleton />
                  </>
                ) : items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[13px] text-fg-subtle">
                    {t(`orders.empty.${column}`)}
                  </p>
                ) : (
                  items.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      now={now}
                      busy={busyId === order.id}
                      onOpen={() => setOpenId(order.id)}
                      onAdvance={(to) => void run(order.id, to)}
                      onReject={() => {
                        setRejectError(null);
                        setRejectingId(order.id);
                      }}
                    />
                  ))
                )}
              </section>
            );
          })}
        </div>
      </main>

      {openOrder && (
        <OrderDrawer
          order={openOrder}
          error={actionError}
          onClose={() => {
            setActionError(null);
            setOpenId(null);
          }}
          onCancelOrder={async () => {
            if ((await run(openOrder.id, 'cancelled')) === null)
              setOpenId(null);
          }}
        />
      )}

      {rejectingOrder && (
        <RejectDialog
          orderNumber={rejectingOrder.number}
          error={rejectError}
          onCancel={() => setRejectingId(null)}
          onConfirm={handleReject}
        />
      )}
    </div>
  );
}
