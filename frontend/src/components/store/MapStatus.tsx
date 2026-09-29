import { useT } from '../../i18n/index.tsx';
import { MapsUnavailableError } from '../../lib/googleMaps.ts';

export type MapLoadState = 'loading' | 'ready' | MapsUnavailableError;

/**
 * Cobre o mapa enquanto o Google carrega (skeleton no próprio elemento) ou
 * quando não dá para carregar (sem chave / falha). Nunca mostra `err.message`.
 */
export default function MapStatus({ state }: { state: MapLoadState }) {
  const t = useT();
  if (state === 'ready') return null;
  if (state === 'loading') {
    return (
      <div
        aria-busy="true"
        data-testid="map-loading"
        className="absolute inset-0 animate-pulse bg-skeleton"
      />
    );
  }
  return (
    <div
      role="alert"
      className="absolute inset-0 flex items-center justify-center bg-surface p-4 text-center text-sm text-muted"
    >
      {state.code === 'no_key'
        ? t('maps.errors.noKey')
        : t('maps.errors.loadFailed')}
    </div>
  );
}
