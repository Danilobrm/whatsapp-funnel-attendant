import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';

import { formatBRL } from '../../../lib/money.ts';

import type { MenuItem } from '../../../api/menu';

interface ItemRowProps {
  item: MenuItem;
  labels: {
    fromPrice: string;
    noPrice: string;
    available: string;
    unavailable: string;
    edit: string;
    delete: string;
    moveUp: string;
    moveDown: string;
    inactive: string;
  };
  busy?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAvailability: (available: boolean) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function ItemRowSkeleton() {
  return (
    <div
      aria-busy="true"
      data-testid="item-row-skeleton"
      className="flex items-center gap-3 rounded-xl border border-line p-3"
    >
      <div className="h-4 w-40 animate-pulse rounded bg-skeleton" />
      <div className="ml-auto h-4 w-20 animate-pulse rounded bg-skeleton" />
    </div>
  );
}

function priceLabel(item: MenuItem, labels: ItemRowProps['labels']): string {
  if (item.sizes.length > 0) {
    const min = Math.min(...item.sizes.map((s) => s.priceCents));
    return `${labels.fromPrice} ${formatBRL(min)}`;
  }
  if (item.priceCents !== null) return formatBRL(item.priceCents);
  return labels.noPrice;
}

export default function ItemRow({
  item,
  labels,
  busy = false,
  onEdit,
  onDelete,
  onToggleAvailability,
  onMoveUp,
  onMoveDown,
}: ItemRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line p-3">
      <div className="flex flex-none flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!onMoveUp}
          aria-label={labels.moveUp}
          className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle transition hover:bg-hover hover:text-fg disabled:opacity-30"
        >
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!onMoveDown}
          aria-label={labels.moveDown}
          className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle transition hover:bg-hover hover:text-fg disabled:opacity-30"
        >
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">
          {item.name}
          {!item.active && (
            <span className="ml-2 rounded-full bg-hover px-2 py-0.5 text-[11px] text-fg-subtle">
              {labels.inactive}
            </span>
          )}
        </p>
        {item.description && (
          <p className="truncate text-[13px] text-fg-muted">
            {item.description}
          </p>
        )}
      </div>

      <span className="flex-none text-sm text-fg-muted">
        {priceLabel(item, labels)}
      </span>

      <label className="flex flex-none cursor-pointer items-center gap-2 text-[13px] text-fg-muted">
        <input
          type="checkbox"
          checked={item.available}
          disabled={busy}
          onChange={(e) => onToggleAvailability(e.target.checked)}
        />
        {item.available ? labels.available : labels.unavailable}
      </label>

      <button
        type="button"
        onClick={onEdit}
        aria-label={labels.edit}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-fg"
      >
        <Pencil className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={labels.delete}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-danger"
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
