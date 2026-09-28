import { type ReactNode } from 'react';
import { Store as StoreIcon } from 'lucide-react';

import { type PaymentMethod } from '../../api/store';
import OpeningHoursEditor, {
  OpeningHoursEditorSkeleton,
} from '../../components/store/OpeningHoursEditor';
import StoreTabs from '../../components/store/StoreTabs';
import SyncStatus from '../../components/settings/SyncStatus';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { useT } from '../../i18n/index.tsx';

const PAYMENT_METHODS: PaymentMethod[] = ['pix', 'cash', 'card_on_delivery'];

interface CardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

function Card({ title, subtitle, children }: CardProps) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <header className="mb-5">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export default function Store() {
  const t = useT();
  const { loading, loadError, draft, patch, syncState, saving, errorMessage } =
    useStoreSettings();

  function togglePaymentMethod(method: PaymentMethod, enabled: boolean) {
    if (!draft) return;
    const paymentMethods = enabled
      ? [...new Set([...draft.paymentMethods, method])]
      : draft.paymentMethods.filter((m) => m !== method);
    patch({ paymentMethods });
  }

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto flex w-full flex-col gap-6 px-8 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-hover text-fg">
              <StoreIcon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <h1 className="text-xl font-medium text-fg">{t('store.title')}</h1>
              <p className="text-sm text-fg-muted">{t('store.subtitle')}</p>
            </div>
          </div>

          <SyncStatus
            state={syncState}
            pendingLabel={t('store.sync.pending')}
            syncingLabel={t('store.sync.syncing')}
            syncedLabel={t('store.sync.synced')}
          />
        </header>

        <StoreTabs />

        {loadError && (
          <p className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            {t('store.loadError')}
          </p>
        )}
        {errorMessage && (
          <p className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            {errorMessage}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
            <Card title={t('store.status.title')}>
              {loading || !draft ? (
                <div className="h-9 w-40 animate-pulse rounded-xl bg-skeleton" />
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-fg-muted">
                    {draft.paused
                      ? t('store.status.pausedNow')
                      : t('store.status.openNow')}
                  </p>
                  <button
                    type="button"
                    onClick={() => patch({ paused: !draft.paused })}
                    className="flex-none rounded-xl border border-line px-4 py-2 text-sm font-medium text-fg transition hover:bg-hover"
                  >
                    {draft.paused ? t('store.status.resume') : t('store.status.pauseNow')}
                  </button>
                </div>
              )}
            </Card>

            <Card title={t('store.hours.title')} subtitle={t('store.hours.subtitle')}>
              {loading || !draft ? (
                <OpeningHoursEditorSkeleton />
              ) : (
                <OpeningHoursEditor
                  value={draft.openingHours}
                  onChange={(openingHours) => patch({ openingHours })}
                  disabled={saving}
                />
              )}
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <Card title={t('store.payment.title')}>
              {loading || !draft ? (
                <div className="h-24 w-full animate-pulse rounded-xl bg-skeleton" />
              ) : (
                <div className="flex flex-col gap-3">
                  {PAYMENT_METHODS.map((method) => (
                    <label
                      key={method}
                      className="flex items-center gap-2 text-sm text-fg"
                    >
                      <input
                        type="checkbox"
                        checked={draft.paymentMethods.includes(method)}
                        disabled={saving}
                        onChange={(e) =>
                          togglePaymentMethod(method, e.target.checked)
                        }
                      />
                      {t(`store.payment.${method}`)}
                    </label>
                  ))}

                  <label className="mt-2 text-sm text-fg">
                    {t('store.payment.pixKey')}
                    <input
                      type="text"
                      value={draft.pixKey ?? ''}
                      disabled={saving}
                      onChange={(e) =>
                        patch({ pixKey: e.target.value || null })
                      }
                      className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                    />
                  </label>

                  <label className="text-sm text-fg">
                    {t('store.payment.ownerWhatsapp')}
                    <input
                      type="text"
                      value={draft.ownerWhatsapp ?? ''}
                      disabled={saving}
                      onChange={(e) =>
                        patch({ ownerWhatsapp: e.target.value || null })
                      }
                      className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                    />
                  </label>
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
