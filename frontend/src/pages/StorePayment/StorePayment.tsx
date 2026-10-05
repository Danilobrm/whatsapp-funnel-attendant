import {
  Banknote,
  Check,
  CreditCard,
  QrCode,
  type LucideIcon,
} from 'lucide-react';

import { type PaymentMethod } from '../../api/store/store.ts';
import SyncStatus from '../../components/settings/SyncStatus/SyncStatus.tsx';
import { useStoreSettings } from '../../hooks/useStoreSettings/useStoreSettings.ts';
import { useT } from '../../i18n/index.tsx';

const PAYMENT_METHODS: PaymentMethod[] = ['pix', 'cash', 'card_on_delivery'];

// lucide não tem o logo do Pix (marca do BCB); QR code é o símbolo que o
// cliente associa ao pagamento por Pix.
const PAYMENT_ICONS: Record<PaymentMethod, LucideIcon> = {
  pix: QrCode,
  cash: Banknote,
  card_on_delivery: CreditCard,
};

/** Aba `/admin/store/payment` — formas de pagamento e chave Pix, com autosave. */
export default function StorePayment() {
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-base font-medium text-fg">
              {t('store.payment.pageTitle')}
            </h2>
            <p className="text-sm text-fg-muted">
              {t('store.payment.pageSubtitle')}
            </p>
          </div>
        </div>

        <SyncStatus
          state={syncState}
          pendingLabel={t('store.sync.pending')}
          syncingLabel={t('store.sync.syncing')}
          syncedLabel={t('store.sync.synced')}
        />
      </header>

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

      <section className="rounded-2xl border border-line bg-surface p-6">
        <header className="mb-5">
          <h2 className="text-sm font-semibold text-fg">
            {t('store.payment.title')}
          </h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            {t('store.payment.subtitle')}
          </p>
        </header>

        {loading || !draft ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              {PAYMENT_METHODS.map((m) => (
                <div
                  key={m}
                  className="h-12 w-44 animate-pulse rounded-full bg-skeleton"
                />
              ))}
            </div>
            <div className="h-9 w-full animate-pulse rounded-xl bg-skeleton" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div
              role="group"
              aria-label={t('store.payment.title')}
              className="flex flex-wrap gap-3"
            >
              {PAYMENT_METHODS.map((method) => {
                const enabled = draft.paymentMethods.includes(method);
                const Icon = PAYMENT_ICONS[method];
                return (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={enabled}
                    disabled={saving}
                    onClick={() => togglePaymentMethod(method, !enabled)}
                    className={`inline-flex items-center gap-2.5 rounded-full border py-2 pl-2 pr-4 text-sm font-medium transition disabled:opacity-60 ${
                      enabled
                        ? 'border-accent bg-accent text-accent-fg'
                        : 'border-line bg-canvas text-fg-muted hover:bg-hover hover:text-fg'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${
                        enabled ? 'bg-accent-fg/20' : 'bg-hover'
                      }`}
                    >
                      <Icon
                        className="h-4 w-4"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </span>
                    {t(`store.payment.${method}`)}
                    {enabled && (
                      <Check
                        className="h-4 w-4"
                        strokeWidth={2.25}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[12px] text-fg-muted">
              {t('store.payment.toggleHint')}
            </p>

            {draft.paymentMethods.includes('pix') && (
              <label className="text-sm text-fg">
                {t('store.payment.pixKey')}
                <input
                  type="text"
                  value={draft.pixKey ?? ''}
                  disabled={saving}
                  onChange={(e) => patch({ pixKey: e.target.value || null })}
                  className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                />
              </label>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
