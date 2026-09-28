import { useEffect, useState } from 'react';

import {
  fetchStoreSettings,
  saveStoreSettings,
  StoreRejectedError,
  type StoreSettings,
} from '../../api/store';
import { useT } from '../../i18n/index.tsx';

import type { SyncStatusState } from '../../components/settings/SyncStatus';

const AUTOSAVE_DELAY_MS = 700;

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; code: string };

/**
 * Configurações da loja com autosave — mesmo padrão de `useSimulator`/
 * `Settings.tsx`. Cada página que chama isto tem sua PRÓPRIA cópia (fetch e
 * `SyncStatus` independentes) — `/admin/store` e `/admin/store/delivery` são
 * páginas separadas, cada uma edita um subconjunto do mesmo `StoreSettings`.
 */
export function useStoreSettings() {
  const t = useT();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState<StoreSettings | null>(null);
  const [draft, setDraft] = useState<StoreSettings | null>(null);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;

    fetchStoreSettings()
      .then((res) => {
        if (cancelled) return;
        setSaved(res.settings);
        setDraft(res.settings);
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

  return { loading, loadError, draft, patch, syncState, saving, errorMessage };
}
