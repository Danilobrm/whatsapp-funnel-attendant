import { useState, type ChangeEvent } from 'react';

import { MenuRejectedError, uploadItemImage } from '../../api/menu/menu.ts';
import { features } from '../../config/features.ts';
import ItemImage from '../../components/menu/ItemImage/ItemImage.tsx';
import LocationMap, {
  LocationMapSkeleton,
} from '../../components/store/LocationMap/LocationMap.tsx';
import { positionOf } from '../../components/store/LocationMap/locationView.ts';
import SyncStatus from '../../components/settings/SyncStatus/SyncStatus.tsx';
import { useStoreSettings } from '../../hooks/useStoreSettings/useStoreSettings.ts';
import { useT } from '../../i18n/index.tsx';

const INPUT_CLASS =
  'mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent';

interface RestaurantPhotoProps {
  src: string | null;
  alt: string;
  disabled: boolean;
  onChange: (url: string | null) => void;
}

/**
 * Foto quadrada clicável — mesmo padrão da foto do item no cardápio (e o
 * mesmo upload, `POST /api/menu/images`): clicar abre o seletor de arquivo.
 */
function RestaurantPhoto({
  src,
  alt,
  disabled,
  onChange,
}: RestaurantPhotoProps) {
  const t = useT();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const result = await uploadItemImage(file);
      onChange(result.url);
    } catch (err) {
      const code = err instanceof MenuRejectedError ? err.code : 'generic';
      const key = `store.errors.${code}`;
      setError(t(key) === key ? t('store.errors.generic') : t(key));
    } finally {
      setUploading(false);
    }
  }

  const busy = disabled || uploading;

  return (
    <div className="flex w-full flex-none flex-col gap-2 sm:w-40">
      <label
        htmlFor="restaurant-photo"
        aria-busy={uploading}
        className={`block overflow-hidden rounded-2xl transition ${
          busy
            ? 'pointer-events-none opacity-60'
            : 'cursor-pointer hover:opacity-90'
        }`}
      >
        <ItemImage src={src} alt={alt} size="full" />
      </label>
      <input
        id="restaurant-photo"
        type="file"
        accept="image/*"
        aria-label={t('store.info.photo')}
        disabled={busy}
        onChange={(e) => void handleFile(e)}
        className="sr-only"
      />
      <p className={`text-[12px] ${error ? 'text-danger' : 'text-fg-muted'}`}>
        {error ??
          (uploading
            ? t('store.info.photoUploading')
            : t('store.info.photoHint'))}
      </p>
      {src && !busy && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="self-start text-[12px] font-medium text-fg-muted transition hover:text-danger"
        >
          {t('store.info.photoRemove')}
        </button>
      )}
    </div>
  );
}

const noop = () => {};

export default function Store() {
  const t = useT();
  const { loading, loadError, draft, patch, syncState, saving, errorMessage } =
    useStoreSettings();

  const position = draft ? positionOf(draft) : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-end gap-4">
        <div className="flex items-center gap-3">
          <SyncStatus
            state={syncState}
            pendingLabel={t('store.sync.pending')}
            syncingLabel={t('store.sync.syncing')}
            syncedLabel={t('store.sync.synced')}
          />
        </div>
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
            {t('store.info.title')}
          </h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            {t('store.info.subtitle')}
          </p>
        </header>

        {loading || !draft ? (
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="aspect-square w-40 flex-none animate-pulse rounded-2xl bg-skeleton" />
            <div className="flex flex-1 flex-col gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-9 w-full animate-pulse rounded-xl bg-skeleton"
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 sm:flex-row">
            <RestaurantPhoto
              src={draft.logoUrl}
              alt={draft.restaurantName ?? t('menu.item.imagePlaceholderAlt')}
              disabled={saving}
              onChange={(logoUrl) => patch({ logoUrl })}
            />

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <label className="text-sm text-fg">
                {t('store.info.name')}
                <input
                  type="text"
                  maxLength={120}
                  value={draft.restaurantName ?? ''}
                  placeholder={t('store.info.namePlaceholder')}
                  disabled={saving}
                  onChange={(e) =>
                    patch({ restaurantName: e.target.value || null })
                  }
                  className={INPUT_CLASS}
                />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm text-fg">
                  {t('store.info.email')}
                  <input
                    type="email"
                    value={draft.contactEmail ?? ''}
                    placeholder={t('store.info.emailPlaceholder')}
                    disabled={saving}
                    onChange={(e) =>
                      patch({ contactEmail: e.target.value || null })
                    }
                    className={INPUT_CLASS}
                  />
                </label>

                <label className="text-sm text-fg">
                  {t('store.info.ownerWhatsapp')}
                  <input
                    type="tel"
                    value={draft.ownerWhatsapp ?? ''}
                    disabled={saving}
                    onChange={(e) =>
                      patch({ ownerWhatsapp: e.target.value || null })
                    }
                    className={INPUT_CLASS}
                  />
                </label>

                <label className="text-sm text-fg">
                  {t('store.info.whatsappNumber')}
                  <input
                    type="tel"
                    inputMode="tel"
                    value={draft.whatsappNumber ?? ''}
                    disabled={saving}
                    placeholder={t('store.info.whatsappNumberPlaceholder')}
                    onChange={(e) =>
                      patch({ whatsappNumber: e.target.value || null })
                    }
                    className={INPUT_CLASS}
                  />
                  <span className="mt-1 block text-[12px] text-fg-subtle">
                    {t('store.info.whatsappNumberHint')}
                  </span>
                </label>
              </div>

              <label className="text-sm text-fg">
                {t('store.info.address')}
                <textarea
                  rows={2}
                  maxLength={300}
                  value={draft.address ?? ''}
                  readOnly
                  className={`${INPUT_CLASS} cursor-default`}
                />
              </label>
            </div>
          </div>
        )}
      </section>

      {features.storeLocation && (
        <section className="rounded-2xl border border-line bg-surface p-6">
          <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-fg">
                {t('store.location.title')}
              </h2>
            </div>
            {draft && (
              <div className="flex flex-wrap items-center gap-3">
                {position && !saving && (
                  <button
                    type="button"
                    onClick={() =>
                      patch({ latitude: null, longitude: null, address: null })
                    }
                    className="text-[13px] font-medium text-fg-muted transition hover:text-danger"
                  >
                    {t('store.location.remove')}
                  </button>
                )}
              </div>
            )}
          </header>

          {loading || !draft ? (
            <LocationMapSkeleton />
          ) : (
            <LocationMap
              position={position}
              cityBounds={null}
              disabled
              onChange={noop}
            />
          )}
        </section>
      )}
    </div>
  );
}
