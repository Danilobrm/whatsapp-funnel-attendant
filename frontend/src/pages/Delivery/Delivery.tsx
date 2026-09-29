import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  createZone,
  deleteZone,
  fetchStoreGeo,
  fetchZones,
  setStoreCity,
  updateZone,
  type CityOption,
  type DeliveryZone,
  type Neighborhood,
  type StoreGeo,
} from '../../api/store/store.ts';
import CityPicker from '../../components/store/CityPicker/CityPicker.tsx';
import DeliveryMap, {
  DeliveryMapSkeleton,
} from '../../components/store/DeliveryMap/DeliveryMap.tsx';
import NeighborhoodFeePanel from '../../components/store/NeighborhoodFeePanel/NeighborhoodFeePanel.tsx';
import { useT } from '../../i18n/index.tsx';
import { normalizeNeighborhood } from '../../lib/neighborhood.ts';

interface CardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}

function Card({ title, subtitle, action, children }: CardProps) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export default function Delivery() {
  const t = useT();
  const [zones, setZones] = useState<DeliveryZone[] | null>(null);
  const [zonesError, setZonesError] = useState(false);

  // `undefined` = carregando; `null` = loja ainda sem cidade.
  const [geo, setGeo] = useState<StoreGeo | null | undefined>(undefined);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [changingCity, setChangingCity] = useState(false);
  const [pickingCity, setPickingCity] = useState(false);
  const [selected, setSelected] = useState<Neighborhood | null>(null);
  const [zoneSaving, setZoneSaving] = useState(false);

  const zonesByKey = useMemo(
    () =>
      new Map(
        (zones ?? []).map((z) => [normalizeNeighborhood(z.neighborhood), z]),
      ),
    [zones],
  );
  const selectedZone = selected ? (zonesByKey.get(selected.key) ?? null) : null;

  function geoErrorText(code: string): string {
    const key = `delivery.errors.${code}`;
    return t(key) === key ? t('delivery.errors.generic') : t(key);
  }

  useEffect(() => {
    let cancelled = false;
    fetchStoreGeo()
      .then((res) => {
        if (!cancelled) setGeo(res.geo);
      })
      .catch(() => {
        if (!cancelled) {
          setGeo(null);
          setGeoError('generic');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePickCity(city: CityOption) {
    setChangingCity(true);
    setGeoError(null);
    try {
      const res = await setStoreCity(city.osmId);
      setGeo(res.geo);
      setSelected(null);
      setPickingCity(false);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String(err.code)
          : 'generic';
      setGeoError(code);
    } finally {
      setChangingCity(false);
    }
  }

  async function handleSaveFee(feeCents: number) {
    if (!selected) return;
    setZoneSaving(true);
    try {
      if (selectedZone) {
        await updateZone(selectedZone.id, {
          neighborhood: selectedZone.neighborhood,
          feeCents,
          active: true,
        });
      } else {
        await createZone({
          neighborhood: selected.name,
          feeCents,
          active: true,
        });
      }
      await reloadZones();
    } catch {
      setZonesError(true);
    } finally {
      setZoneSaving(false);
    }
  }

  async function handleRemoveFee() {
    if (!selectedZone) return;
    setZoneSaving(true);
    try {
      await deleteZone(selectedZone.id);
      await reloadZones();
    } catch {
      setZonesError(true);
    } finally {
      setZoneSaving(false);
    }
  }

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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-base font-medium text-fg">
              {t('delivery.title')}
            </h2>
            <p className="text-sm text-fg-muted">{t('delivery.subtitle')}</p>
          </div>
        </div>
      </header>

      {zonesError && (
        <p className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
          {t('store.errors.generic')}
        </p>
      )}

      <Card
        title={t('delivery.map.title')}
        subtitle={
          geo
            ? `${geo.cityName}${geo.state ? ` · ${geo.state}` : ''}`
            : t('delivery.map.subtitle')
        }
        action={
          geo && !pickingCity ? (
            <button
              type="button"
              onClick={() => setPickingCity(true)}
              className="rounded-xl border border-line px-3 py-1.5 text-[13px] font-medium text-fg transition hover:bg-hover"
            >
              {t('delivery.city.change')}
            </button>
          ) : null
        }
      >
        {geoError && (
          <p className="mb-4 rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            {geoErrorText(geoError)}
          </p>
        )}

        {geo === undefined ? (
          <DeliveryMapSkeleton />
        ) : !geo || pickingCity ? (
          <div className="flex max-w-md flex-col gap-3">
            <p className="text-sm text-fg-muted">
              {changingCity
                ? t('delivery.city.loading')
                : t('delivery.city.prompt')}
            </p>
            {changingCity ? (
              <DeliveryMapSkeleton />
            ) : (
              <CityPicker onPick={(city) => void handlePickCity(city)} />
            )}
            {geo && !changingCity && (
              <button
                type="button"
                onClick={() => setPickingCity(false)}
                className="self-start text-[13px] font-medium text-fg-muted transition hover:text-fg"
              >
                {t('delivery.city.cancel')}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mapa em largura total, como o da aba Geral; a taxa do bairro
                  selecionado flutua sobre ele. */}
            <div className="relative">
              <DeliveryMap
                geo={geo}
                zonesByKey={zonesByKey}
                selectedKey={selected?.key ?? null}
                onSelect={setSelected}
              />
              {selected && (
                <div className="absolute right-3 top-3 z-[1000] w-72 max-w-[calc(100%-1.5rem)]">
                  <NeighborhoodFeePanel
                    neighborhood={selected.name}
                    zone={selectedZone}
                    saving={zoneSaving}
                    onSave={(fee) => void handleSaveFee(fee)}
                    onRemove={() => void handleRemoveFee()}
                    onClose={() => setSelected(null)}
                  />
                </div>
              )}
            </div>
            <p className="mt-2 text-[12px] text-fg-muted">
              {geo.neighborhoods.length > 0
                ? t('delivery.map.pickHint')
                : t('delivery.map.noNeighborhoods')}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
