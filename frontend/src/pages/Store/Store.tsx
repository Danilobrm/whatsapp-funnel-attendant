import { useEffect, useState, type ReactNode } from 'react';
import { Store as StoreIcon } from 'lucide-react';

import {
  createZone,
  deleteZone,
  fetchStoreSettings,
  fetchZones,
  saveStoreSettings,
  StoreRejectedError,
  updateZone,
  type DeliveryZone,
  type DeliveryZoneFormInput,
  type PaymentMethod,
  type StoreSettings,
} from '../../api/store';
import OpeningHoursEditor, {
  OpeningHoursEditorSkeleton,
} from '../../components/store/OpeningHoursEditor';
import ZonesTable, { ZonesTableSkeleton } from '../../components/store/ZonesTable';
import SyncStatus, {
  type SyncStatusState,
} from '../../components/settings/SyncStatus';
import { useT } from '../../i18n/index.tsx';

const AUTOSAVE_DELAY_MS = 700;

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

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; code: string };

export default function Store() {
  const t = useT();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState<StoreSettings | null>(null);
  const [draft, setDraft] = useState<StoreSettings | null>(null);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });

  const [zones, setZones] = useState<DeliveryZone[] | null>(null);
  const [zonesError, setZonesError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchStoreSettings(), fetchZones()])
      .then(([settingsRes, zonesRes]) => {
        if (cancelled) return;
        setSaved(settingsRes.settings);
        setDraft(settingsRes.settings);
        setZones(zonesRes.zones);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function patch(next: Partial<StoreSettings>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }

  function togglePaymentMethod(method: PaymentMethod, enabled: boolean) {
    setDraft((current) => {
      if (!current) return current;
      const paymentMethods = enabled
        ? [...new Set([...current.paymentMethods, method])]
        : current.paymentMethods.filter((m) => m !== method);
      return { ...current, paymentMethods };
    });
  }

  async function submit(next: StoreSettings) {
    setSave({ status: 'saving' });
    try {
      const result = await saveStoreSettings({
        timezone: next.timezone,
        openingHours: next.openingHours,
        paused: next.paused,
        minOrderCents: next.minOrderCents,
        estimatedMinutes: next.estimatedMinutes,
        pickupEnabled: next.pickupEnabled,
        deliveryEnabled: next.deliveryEnabled,
        paymentMethods: next.paymentMethods,
        pixKey: next.pixKey,
        ownerWhatsapp: next.ownerWhatsapp,
      });
      setSaved(result.settings);
      setDraft(result.settings);
      setSave({ status: 'saved' });
    } catch (err) {
      setSave({
        status: 'error',
        code: err instanceof StoreRejectedError ? err.code : 'generic',
      });
    }
  }

  const dirty =
    draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    if (loading || !dirty || !draft) return;
    const timer = setTimeout(() => void submit(draft), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, dirty, loading]);

  const saving = save.status === 'saving';
  const syncState: SyncStatusState = saving
    ? 'syncing'
    : save.status === 'saved'
      ? 'synced'
      : dirty
        ? 'pending'
        : 'idle';

  const errorMessage =
    save.status === 'error'
      ? t(`store.errors.${save.code}`) === `store.errors.${save.code}`
        ? t('store.errors.generic')
        : t(`store.errors.${save.code}`)
      : null;

  async function reloadZones() {
    try {
      const res = await fetchZones();
      setZones(res.zones);
      setZonesError(false);
    } catch {
      setZonesError(true);
    }
  }

  async function handleAddZone(input: DeliveryZoneFormInput) {
    try {
      await createZone(input);
      await reloadZones();
    } catch {
      setZonesError(true);
    }
  }

  async function handleUpdateZone(id: number, input: DeliveryZoneFormInput) {
    try {
      await updateZone(id, input);
      await reloadZones();
    } catch {
      setZonesError(true);
    }
  }

  async function handleDeleteZone(id: number) {
    try {
      await deleteZone(id);
      await reloadZones();
    } catch {
      setZonesError(true);
    }
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
        {zonesError && (
          <p className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            {t('store.errors.generic')}
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

            <Card title={t('store.zones.title')} subtitle={t('store.zones.subtitle')}>
              {loading || !zones ? (
                <ZonesTableSkeleton />
              ) : (
                <ZonesTable
                  zones={zones}
                  onAdd={(input) => void handleAddZone(input)}
                  onUpdate={(id, input) => void handleUpdateZone(id, input)}
                  onDelete={(id) => void handleDeleteZone(id)}
                />
              )}
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <Card title={t('store.fulfillment.title')}>
              {loading || !draft ? (
                <div className="flex flex-col gap-3">
                  <div className="h-8 w-full animate-pulse rounded-xl bg-skeleton" />
                  <div className="h-8 w-full animate-pulse rounded-xl bg-skeleton" />
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <label className="flex items-center gap-2 text-sm text-fg">
                    <input
                      type="checkbox"
                      checked={draft.pickupEnabled}
                      disabled={saving}
                      onChange={(e) => patch({ pickupEnabled: e.target.checked })}
                    />
                    {t('store.fulfillment.pickup')}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-fg">
                    <input
                      type="checkbox"
                      checked={draft.deliveryEnabled}
                      disabled={saving}
                      onChange={(e) => patch({ deliveryEnabled: e.target.checked })}
                    />
                    {t('store.fulfillment.delivery')}
                  </label>

                  <label className="text-sm text-fg">
                    {t('store.fulfillment.minOrder')}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={(draft.minOrderCents / 100).toFixed(2).replace('.', ',')}
                      disabled={saving}
                      onChange={(e) => {
                        const cents = Math.round(
                          (Number(e.target.value.replace(',', '.')) || 0) * 100,
                        );
                        patch({ minOrderCents: cents });
                      }}
                      className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                    />
                  </label>

                  <label className="text-sm text-fg">
                    {t('store.fulfillment.estimatedMinutes')}
                    <input
                      type="number"
                      min={1}
                      value={draft.estimatedMinutes}
                      disabled={saving}
                      onChange={(e) =>
                        patch({ estimatedMinutes: Number(e.target.value) || 1 })
                      }
                      className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                    />
                  </label>
                </div>
              )}
            </Card>

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
