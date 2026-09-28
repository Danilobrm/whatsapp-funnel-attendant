import { useEffect, useState, type ReactNode } from 'react';
import { Bike } from 'lucide-react';

import {
  createZone,
  deleteZone,
  fetchZones,
  updateZone,
  type DeliveryZone,
  type DeliveryZoneFormInput,
} from '../../api/store';
import StoreTabs from '../../components/store/StoreTabs';
import ZonesTable, { ZonesTableSkeleton } from '../../components/store/ZonesTable';
import SyncStatus from '../../components/settings/SyncStatus';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { useT } from '../../i18n/index.tsx';

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

export default function Delivery() {
  const t = useT();
  const { loading, loadError, draft, patch, syncState, saving, errorMessage } =
    useStoreSettings();

  const [zones, setZones] = useState<DeliveryZone[] | null>(null);
  const [zonesError, setZonesError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchZones()
      .then((res) => {
        if (!cancelled) setZones(res.zones);
      })
      .catch(() => {
        if (!cancelled) setZonesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
              <Bike className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <h1 className="text-xl font-medium text-fg">{t('delivery.title')}</h1>
              <p className="text-sm text-fg-muted">{t('delivery.subtitle')}</p>
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
        {zonesError && (
          <p className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            {t('store.errors.generic')}
          </p>
        )}

        <Card title={t('store.fulfillment.title')}>
          {loading || !draft ? (
            <div className="flex flex-col gap-3">
              <div className="h-8 w-full animate-pulse rounded-xl bg-skeleton" />
              <div className="h-8 w-full animate-pulse rounded-xl bg-skeleton" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </main>
    </div>
  );
}
