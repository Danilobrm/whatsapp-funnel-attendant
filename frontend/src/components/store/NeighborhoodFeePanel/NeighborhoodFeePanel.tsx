import { useEffect, useState, type FormEvent } from 'react';
import { MousePointerClick, X } from 'lucide-react';

import { formatBRL, parseBRLInput } from '../../../lib/money.ts';
import { useT } from '../../../i18n/index.tsx';

import type { DeliveryZone } from '../../../api/store/store.ts';

interface NeighborhoodFeePanelProps {
  /** Nome do bairro clicado no mapa; `null` = nada selecionado. */
  neighborhood: string | null;
  zone: DeliveryZone | null;
  saving: boolean;
  onSave: (feeCents: number) => void;
  onRemove: () => void;
  /** Fecha o painel (desmarca o bairro). Sem isto, não há botão de fechar. */
  onClose?: () => void;
}

function centsToText(cents: number): string {
  return formatBRL(cents).replace(/^R\$\s?/, '');
}

/** Taxa do bairro selecionado no mapa — cria ou atualiza a zona pelo nome. */
export default function NeighborhoodFeePanel({
  neighborhood,
  zone,
  saving,
  onSave,
  onRemove,
  onClose,
}: NeighborhoodFeePanelProps) {
  const t = useT();
  const [feeText, setFeeText] = useState('');

  useEffect(() => {
    setFeeText(zone ? centsToText(zone.feeCents) : '');
  }, [neighborhood, zone]);

  if (!neighborhood) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-10 text-center">
        <MousePointerClick
          className="h-6 w-6 text-fg-subtle"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p className="text-sm text-fg-muted">{t('delivery.map.pickHint')}</p>
      </div>
    );
  }

  const feeCents = parseBRLInput(feeText);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (feeCents === null) return;
    onSave(feeCents);
  }

  return (
    <form
      onSubmit={submit}
      className="relative flex flex-col gap-4 rounded-xl border border-line bg-canvas p-4 shadow-lg"
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('delivery.map.close')}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-fg"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      <div>
        <p className="text-[12px] text-fg-muted">
          {t('delivery.map.selected')}
        </p>
        <h3 className="text-base font-medium text-fg">{neighborhood}</h3>
        <p className="mt-0.5 text-[13px] text-fg-muted">
          {zone
            ? `${t('delivery.map.currentFee')} ${formatBRL(zone.feeCents)}`
            : t('delivery.map.noFee')}
        </p>
      </div>

      <label className="text-sm text-fg">
        {t('delivery.map.feeLabel')}
        <input
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          value={feeText}
          disabled={saving}
          onChange={(e) => setFeeText(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        />
      </label>

      <div className="flex items-center justify-between gap-2">
        {zone ? (
          <button
            type="button"
            disabled={saving}
            onClick={onRemove}
            className="text-[13px] font-medium text-fg-muted transition hover:text-danger disabled:opacity-60"
          >
            {t('delivery.map.remove')}
          </button>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={saving || feeCents === null}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-60"
        >
          {saving ? t('delivery.map.saving') : t('delivery.map.save')}
        </button>
      </div>
    </form>
  );
}
