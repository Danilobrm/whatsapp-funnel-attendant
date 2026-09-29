import OpeningHoursEditor, {
  OpeningHoursEditorSkeleton,
} from '../../components/store/OpeningHoursEditor/OpeningHoursEditor.tsx';
import SyncStatus from '../../components/settings/SyncStatus/SyncStatus.tsx';
import { useStoreSettings } from '../../hooks/useStoreSettings/useStoreSettings.ts';
import { useT } from '../../i18n/index.tsx';

/** Aba `/admin/store/hours` — mesmo autosave de `useStoreSettings` das outras abas. */
export default function StoreHours() {
  const t = useT();
  const { loading, loadError, draft, patch, syncState, saving, errorMessage } =
    useStoreSettings();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-base font-medium text-fg">
              {t('store.hours.title')}
            </h2>
            <p className="text-sm text-fg-muted">{t('store.hours.subtitle')}</p>
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
        {loading || !draft ? (
          <OpeningHoursEditorSkeleton />
        ) : (
          <OpeningHoursEditor
            value={draft.openingHours}
            onChange={(openingHours) => patch({ openingHours })}
            disabled={saving}
          />
        )}
      </section>
    </div>
  );
}
