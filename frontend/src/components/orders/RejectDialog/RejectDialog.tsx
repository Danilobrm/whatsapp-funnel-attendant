import { useEffect, useState } from 'react';

import { REJECT_REASONS, type RejectReason } from '../../../api/orders/orders.ts';
import { useT } from '../../../i18n/index.tsx';

interface RejectDialogProps {
  orderNumber: number;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (
    reason: RejectReason,
    note: string | null,
  ) => Promise<void> | void;
}

/**
 * Recusa com motivo obrigatório — o cliente recebe o motivo pelo atendente.
 * "Outro" exige o texto que ele vai ler. Confirmar fica desabilitado até a
 * escolha ser válida.
 */
export default function RejectDialog({
  orderNumber,
  error,
  onCancel,
  onConfirm,
}: RejectDialogProps) {
  const t = useT();
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const valid =
    reason !== null && (reason !== 'other' || note.trim().length > 0);

  async function handleConfirm() {
    if (!valid || reason === null) return;
    setSubmitting(true);
    try {
      await onConfirm(reason, reason === 'other' ? note.trim() : null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={onCancel}
        className="absolute inset-0 bg-canvas/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-dialog-title"
        className="relative z-10 flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-surface p-4 md:p-6 shadow-lg"
      >
        <div>
          <h2
            id="reject-dialog-title"
            className="text-base font-semibold text-fg"
          >
            {t('orders.reject.title')} #{orderNumber}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {t('orders.reject.description')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {REJECT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
                reason === r
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-line text-fg-muted hover:border-line-strong hover:text-fg'
              }`}
            >
              {t(`orders.reject.reasons.${r}`)}
            </button>
          ))}
        </div>

        {reason === 'other' && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('orders.reject.notePlaceholder')}
            aria-label={t('orders.reject.notePlaceholder')}
            maxLength={280}
            rows={3}
            className="w-full resize-none rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
        )}

        {error && (
          <p className="rounded-xl border border-danger-border bg-danger-bg px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-medium text-fg-muted transition hover:bg-hover hover:text-fg"
          >
            {t('orders.reject.back')}
          </button>
          <button
            type="button"
            disabled={!valid || submitting}
            onClick={() => void handleConfirm()}
            className="rounded-xl bg-danger px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
          >
            {t('orders.reject.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
