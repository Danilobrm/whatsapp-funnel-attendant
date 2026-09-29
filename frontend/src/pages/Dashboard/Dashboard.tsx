import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';

import RankedList, {
  type RankedRow,
} from '../../components/dashboard/RankedList/RankedList.tsx';
import RevenueChart, {
  RevenueChartSkeleton,
} from '../../components/dashboard/RevenueChart/RevenueChart.tsx';
import StatCard from '../../components/dashboard/StatCard/StatCard.tsx';
import StoreStatus from '../../components/dashboard/StoreStatus/StoreStatus.tsx';
import { fill } from '../../components/dashboard/format.ts';
import { useDashboard } from '../../hooks/useDashboard/useDashboard.ts';
import { useT } from '../../i18n/index.tsx';
import { formatBRL } from '../../lib/money.ts';

function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 ${className}`}
    >
      <header>
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {subtitle && <p className="text-[13px] text-fg-subtle">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const t = useT();
  const { data, loading, error } = useDashboard();
  const waiting = loading && !data;

  const topMax = Math.max(...(data?.topItems.map((i) => i.quantity) ?? []), 0);
  const topRows: RankedRow[] = (data?.topItems ?? []).map((item) => ({
    key: item.name,
    label: item.name,
    value: `${fill(t('dashboard.topItems.sold'), { n: item.quantity })} · ${formatBRL(item.revenueCents)}`,
    share: topMax === 0 ? 0 : (item.quantity / topMax) * 100,
  }));

  const funnel = data?.menuFunnel;
  const funnelRows: RankedRow[] =
    !funnel || funnel.sent === 0
      ? []
      : (['sent', 'opened', 'confirmed', 'ordered'] as const).map((step) => ({
          key: step,
          label: t(`dashboard.menuFunnel.${step}`),
          // Percentual sobre quem recebeu o link: mostra onde o cliente some.
          value: `${funnel[step]} · ${Math.round((funnel[step] / funnel.sent) * 100)}%`,
          share: (funnel[step] / funnel.sent) * 100,
        }));

  const today = data?.today;

  return (
    <div className="h-full overflow-y-auto">
      <main className="flex w-full flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-hover text-fg">
            <LayoutDashboard className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div>
            <h1 className="text-xl font-medium text-fg">
              {t('dashboard.title')}
            </h1>
            <p className="text-sm text-fg-muted">{t('dashboard.subtitle')}</p>
          </div>
        </header>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger"
          >
            {data ? t('dashboard.refreshError') : t('dashboard.loadError')}
          </p>
        )}

        <StoreStatus
          store={data?.store ?? null}
          timezone={data?.timezone ?? 'UTC'}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t('dashboard.cards.ordersToday')}
            loading={waiting}
            value={String(today?.orders ?? 0)}
            hint={
              today && today.rejected > 0
                ? fill(t('dashboard.cards.rejectedToday'), {
                    n: today.rejected,
                  })
                : t('dashboard.cards.noneRejected')
            }
          />
          <StatCard
            label={t('dashboard.cards.revenueToday')}
            loading={waiting}
            value={formatBRL(today?.revenueCents ?? 0)}
          />
          <StatCard
            label={t('dashboard.cards.ticketToday')}
            loading={waiting}
            value={formatBRL(today?.ticketCents ?? 0)}
            hint={t('dashboard.cards.ticketHint')}
          />
          <StatCard
            label={t('dashboard.cards.active')}
            loading={waiting}
            value={String(today?.active ?? 0)}
            hint={
              <Link
                to="/admin/orders"
                className="font-medium text-accent hover:underline"
              >
                {t('dashboard.cards.viewOrders')}
              </Link>
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel
            title={t('dashboard.chart.title')}
            subtitle={t('dashboard.chart.subtitle')}
          >
            {waiting || !data ? (
              <RevenueChartSkeleton />
            ) : (
              <RevenueChart days={data.last7Days} />
            )}
          </Panel>
          <Panel
            title={t('dashboard.topItems.title')}
            subtitle={t('dashboard.topItems.subtitle')}
          >
            <RankedList
              rows={topRows}
              loading={waiting}
              emptyText={t('dashboard.topItems.empty')}
            />
          </Panel>
          <Panel
            title={t('dashboard.menuFunnel.title')}
            subtitle={t('dashboard.menuFunnel.subtitle')}
            className="lg:col-span-2"
          >
            <RankedList
              rows={funnelRows}
              loading={waiting}
              emptyText={t('dashboard.menuFunnel.empty')}
            />
          </Panel>
        </div>
      </main>
    </div>
  );
}
