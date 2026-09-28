import FlagIcon from '../FlagIcon';

export interface LanguageItem {
  code: string;
  label: string;
  description?: string;
  enabled: boolean;
  /** Idioma que não pode ser desligado (ex.: o único disponível). */
  locked?: boolean;
  /** Motivo do bloqueio, já traduzido. */
  lockedHint?: string;
}

interface LanguageListProps {
  items: LanguageItem[];
  onToggle: (code: string, enabled: boolean) => void;
  activeLabel: string;
}

export function LanguageListSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <ul
      className="flex flex-col gap-2"
      aria-busy="true"
      data-testid="language-list-skeleton"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-line p-4"
        >
          <div className="h-5 w-7 animate-pulse rounded-[3px] bg-skeleton" />
          <div className="min-w-0 flex-1">
            <div className="h-4 w-40 animate-pulse rounded bg-skeleton" />
            <div className="mt-2 h-3 w-56 animate-pulse rounded bg-skeleton" />
          </div>
          <div className="h-5 w-10 animate-pulse rounded-full bg-skeleton" />
        </li>
      ))}
    </ul>
  );
}

/** Idiomas que o bot fala. Um idioma travado fica visível, porém desabilitado. */
export default function LanguageList({
  items,
  onToggle,
  activeLabel,
}: LanguageListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.code}
          className="flex items-center gap-3 rounded-xl border border-line p-4"
        >
          <FlagIcon code={item.code} title={item.label} />

          <div className="min-w-0 flex-1">
            <p
              id={`language-${item.code}`}
              className="text-sm font-medium text-fg"
            >
              {item.label}
            </p>
            {item.description && (
              <p className="mt-0.5 text-[13px] text-fg-muted">
                {item.description}
              </p>
            )}
          </div>

          {item.enabled && (
            <span className="rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success">
              {activeLabel}
            </span>
          )}

          <label
            className={`inline-flex items-center gap-2 ${
              item.locked ? 'cursor-not-allowed' : 'cursor-pointer'
            }`}
            title={item.locked ? item.lockedHint : undefined}
          >
            {/* Nome acessível vem do rótulo já renderizado — sem texto duplicado. */}
            <input
              type="checkbox"
              className="sr-only"
              aria-labelledby={`language-${item.code}`}
              checked={item.enabled}
              disabled={item.locked}
              onChange={(e) => onToggle(item.code, e.target.checked)}
            />
            <span
              aria-hidden="true"
              className={`relative h-5 w-9 rounded-full transition ${
                item.enabled ? 'bg-accent' : 'bg-hover'
              } ${item.locked ? 'opacity-60' : ''}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-all ${
                  item.enabled ? 'left-[1.125rem]' : 'left-0.5'
                }`}
              />
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
