import { Link } from 'react-router-dom';

import { useI18n } from '../../../i18n/index.tsx';
import { fill, openingLabel } from '../format.ts';

import type { Dashboard } from '../../../api/dashboard/dashboard.ts';

interface StoreStatusProps {
  store: Dashboard['store'] | null;
  timezone: string;
}

/**
 * Aberta / pausada / fechada, com ponto + TEXTO (status nunca só por cor).
 * Fechada mostra quando abre, no fuso da loja.
 */
export default function StoreStatus({ store, timezone }: StoreStatusProps) {
  const { t, locale } = useI18n();

  let dot = 'bg-fg-subtle';
  let title = '';
  let detail = '';
  if (store) {
    if (store.paused) {
      dot = 'bg-warning';
      title = t('dashboard.store.paused');
      detail = t('dashboard.store.pausedHint');
    } else if (store.open) {
      dot = 'bg-success';
      title = t('dashboard.store.open');
    } else {
      title = t('dashboard.store.closed');
      detail = store.nextOpeningAt
        ? fill(t('dashboard.store.opensAt'), {
            when: openingLabel(store.nextOpeningAt, locale, timezone),
          })
        : t('dashboard.store.noHours');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3">
      {store ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-2 text-sm"
        >
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 flex-none rounded-full ${dot}`}
          />
          <span className="font-medium text-fg">{title}</span>
          {/* Espaço real entre os spans: o `gap` separa na tela, mas o leitor
              de tela leria "fechada·abre" colado. */}
          {detail && ' '}
          {detail && <span className="text-fg-muted">· {detail}</span>}
        </p>
      ) : (
        <div
          aria-busy="true"
          data-testid="store-status-skeleton"
          className="h-5 w-48 animate-pulse rounded bg-skeleton"
        />
      )}
      <Link
        to="/admin/store"
        className="ml-auto text-[13px] font-medium text-accent hover:underline"
      >
        {t('dashboard.store.manage')}
      </Link>
    </div>
  );
}
