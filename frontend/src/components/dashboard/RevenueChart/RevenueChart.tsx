import { useState } from 'react';

import { useI18n } from '../../../i18n/index.tsx';
import { formatBRL } from '../../../lib/money.ts';
import { fill, weekdayLabel } from '../format.ts';

import type { DailyTotal } from '../../../api/dashboard/dashboard.ts';

interface RevenueChartProps {
  days: DailyTotal[];
}

export function RevenueChartSkeleton() {
  return (
    <div
      aria-busy="true"
      data-testid="chart-skeleton"
      className="flex h-48 items-end gap-2 border-b border-line pb-px"
    >
      {[40, 65, 30, 80, 55, 70, 90].map((h, i) => (
        <div key={i} className="flex flex-1 justify-center">
          <div
            className="w-6 animate-pulse rounded-t-[4px] bg-skeleton"
            style={{ height: `${h}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Faturamento por dia, uma série só (sem legenda — o título diz o que é).
 * Colunas finas (≤ 24px) com topo arredondado e base reta na linha de base;
 * hoje em cor cheia, os outros dias atenuados; valor escrito só em hoje
 * (rótulo seletivo) e o resto no tooltip por coluna. Tabela escondida para
 * leitor de tela carrega todos os números.
 */
export default function RevenueChart({ days }: RevenueChartProps) {
  const { t, locale } = useI18n();
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(...days.map((d) => d.revenueCents), 0);
  if (max === 0) {
    return (
      <p className="flex h-48 items-center justify-center rounded-xl border border-dashed border-line text-[13px] text-fg-subtle">
        {t('dashboard.chart.empty')}
      </p>
    );
  }

  const todayIndex = days.length - 1;
  const ordersLabel = (n: number) =>
    n === 1
      ? t('dashboard.chart.order')
      : fill(t('dashboard.chart.orders'), { n });
  const dayLabel = (i: number, day: string) =>
    i === todayIndex ? t('dashboard.chart.today') : weekdayLabel(day, locale);

  return (
    <div>
      <div className="flex h-48 items-end gap-2 border-b border-line">
        {days.map((d, i) => {
          const isToday = i === todayIndex;
          // Valor > 0 nunca some: no mínimo 2px de coluna.
          const height =
            d.revenueCents === 0
              ? 0
              : Math.max((d.revenueCents / max) * 100, 2);
          const summary = `${dayLabel(i, d.day)}: ${formatBRL(d.revenueCents)} · ${ordersLabel(d.orders)}`;
          return (
            // A coluna inteira (não só a barra) é o alvo do hover/foco.
            <div
              key={d.day}
              role="img"
              tabIndex={0}
              aria-label={summary}
              data-today={isToday || undefined}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="relative flex h-full flex-1 flex-col items-center justify-end outline-none focus-visible:rounded-md focus-visible:bg-hover"
            >
              {isToday && active !== i && (
                <span className="mb-1 whitespace-nowrap text-[12px] font-medium text-fg">
                  {formatBRL(d.revenueCents)}
                </span>
              )}
              <div
                className={`w-full max-w-6 rounded-t-[4px] bg-accent transition-opacity ${
                  isToday || active === i ? 'opacity-100' : 'opacity-35'
                }`}
                style={{ height: `${height}%` }}
              />
              {active === i && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-md"
                >
                  <p className="font-medium text-fg">{dayLabel(i, d.day)}</p>
                  <p className="text-fg">{formatBRL(d.revenueCents)}</p>
                  <p className="text-fg-muted">{ordersLabel(d.orders)}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="mt-2 flex gap-2">
        {days.map((d, i) => (
          <span
            key={d.day}
            className={`flex-1 text-center text-[12px] ${
              i === todayIndex ? 'font-medium text-fg' : 'text-fg-subtle'
            }`}
          >
            {dayLabel(i, d.day)}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>{t('dashboard.chart.title')}</caption>
        <thead>
          <tr>
            <th>{t('dashboard.chart.day')}</th>
            <th>{t('dashboard.chart.revenue')}</th>
            <th>{t('dashboard.chart.ordersColumn')}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={d.day}>
              <td>{dayLabel(i, d.day)}</td>
              <td>{formatBRL(d.revenueCents)}</td>
              <td>{d.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
