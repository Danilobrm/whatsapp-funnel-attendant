import { useState } from 'react';
import { Trash2 } from 'lucide-react';

import { formatBRL, parseBRLInput } from '../../../lib/money.ts';
import { useT } from '../../../i18n/index.tsx';

import type { DeliveryZone, DeliveryZoneFormInput } from '../../../api/store';

interface ZonesTableProps {
  zones: DeliveryZone[];
  onAdd: (input: DeliveryZoneFormInput) => void;
  onUpdate: (id: number, input: DeliveryZoneFormInput) => void;
  onDelete: (id: number) => void;
}

export function ZonesTableSkeleton() {
  return (
    <div aria-busy="true" data-testid="zones-table-skeleton" className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-9 w-full animate-pulse rounded-xl bg-skeleton" />
      ))}
    </div>
  );
}

export default function ZonesTable({
  zones,
  onAdd,
  onUpdate,
  onDelete,
}: ZonesTableProps) {
  const t = useT();
  const [newNeighborhood, setNewNeighborhood] = useState('');
  const [newFeeText, setNewFeeText] = useState('');

  function submitNew() {
    const feeCents = parseBRLInput(newFeeText);
    if (newNeighborhood.trim().length === 0 || feeCents === null) return;
    onAdd({ neighborhood: newNeighborhood.trim(), feeCents, active: true });
    setNewNeighborhood('');
    setNewFeeText('');
  }

  return (
    <div className="flex flex-col gap-2">
      {zones.length === 0 && (
        <p className="text-[13px] text-fg-subtle">{t('store.zones.empty')}</p>
      )}

      {zones.map((zone) => (
        <div key={zone.id} className="flex items-center gap-2">
          <input
            type="text"
            aria-label={t('store.zones.neighborhood')}
            defaultValue={zone.neighborhood}
            onBlur={(e) => {
              const neighborhood = e.target.value.trim();
              if (neighborhood.length === 0 || neighborhood === zone.neighborhood)
                return;
              onUpdate(zone.id, {
                neighborhood,
                feeCents: zone.feeCents,
                active: zone.active,
              });
            }}
            className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          />
          <input
            type="text"
            inputMode="decimal"
            aria-label={t('store.zones.fee')}
            defaultValue={formatBRL(zone.feeCents).replace(/^R\$\s?/, '')}
            onBlur={(e) => {
              const feeCents = parseBRLInput(e.target.value);
              if (feeCents === null || feeCents === zone.feeCents) return;
              onUpdate(zone.id, {
                neighborhood: zone.neighborhood,
                feeCents,
                active: zone.active,
              });
            }}
            className="w-28 flex-none rounded-xl border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          />
          <label className="flex flex-none items-center gap-2 text-[13px] text-fg-muted">
            <input
              type="checkbox"
              checked={zone.active}
              onChange={(e) =>
                onUpdate(zone.id, {
                  neighborhood: zone.neighborhood,
                  feeCents: zone.feeCents,
                  active: e.target.checked,
                })
              }
            />
            {t('store.zones.active')}
          </label>
          <button
            type="button"
            onClick={() => onDelete(zone.id)}
            aria-label={t('store.zones.delete')}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-danger"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      ))}

      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          placeholder={t('store.zones.newNeighborhoodPlaceholder')}
          value={newNeighborhood}
          onChange={(e) => setNewNeighborhood(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
        />
        <input
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          value={newFeeText}
          onChange={(e) => setNewFeeText(e.target.value)}
          className="w-28 flex-none rounded-xl border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={submitNew}
          disabled={
            newNeighborhood.trim().length === 0 || parseBRLInput(newFeeText) === null
          }
          className="flex-none rounded-xl bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-60"
        >
          {t('store.zones.add')}
        </button>
      </div>
    </div>
  );
}
