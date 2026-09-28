import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';

import { formatBRL } from '../../../lib/money.ts';
import ItemImage from '../ItemImage';

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
      <div className="h-14 w-14 flex-none animate-pulse rounded-xl bg-skeleton" />
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
    <div className="flex items-center gap-3 rounded-xl border border-line p-3 transition hover:border-line-strong">
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

      <ItemImage src={item.imageUrl} alt={item.name} size="sm" />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
          {item.name}
          {!item.active && (
            <span className="flex-none rounded-full bg-hover px-2 py-0.5 text-[11px] text-fg-subtle">
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

      <span className="flex-none text-sm font-medium text-fg">
        {priceLabel(item, labels)}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={item.available}
        aria-label={item.available ? labels.available : labels.unavailable}
        disabled={busy}
        onClick={() => onToggleAvailability(!item.available)}
        className={`flex flex-none items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium transition disabled:opacity-60 ${
          item.available
            ? 'bg-success-bg text-success'
            : 'bg-warning-bg text-warning-fg'
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 flex-none rounded-full ${
            item.available ? 'bg-success' : 'bg-warning'
          }`}
        />
        {item.available ? labels.available : labels.unavailable}
      </button>

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
