import { Check, Loader2 } from 'lucide-react';

export type SyncStatusState = 'idle' | 'pending' | 'syncing' | 'synced';

export interface SyncStatusProps {
  state: SyncStatusState;
  pendingLabel: string;
  syncingLabel: string;
  syncedLabel: string;
}

/**
 * Indicador passivo — não é mais um botão. Mudanças salvam sozinhas; isto só
 * relata em que ponto do ciclo o salvamento está.
 */
export default function SyncStatus({
  state,
  pendingLabel,
  syncingLabel,
  syncedLabel,
}: SyncStatusProps) {
  if (state === 'idle') return null;

  const label =
    state === 'pending'
      ? pendingLabel
      : state === 'syncing'
        ? syncingLabel
        : syncedLabel;

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 text-sm text-fg-muted"
    >
      {state === 'synced' ? (
        <Check
          className="h-4 w-4 text-success"
          strokeWidth={2}
          aria-hidden="true"
        />
      ) : (
        <Loader2
          className={`h-4 w-4 ${state === 'syncing' ? 'animate-spin' : 'opacity-60'}`}
          strokeWidth={2}
          aria-hidden="true"
        />
      )}
      {label}
    </div>
  );
}
