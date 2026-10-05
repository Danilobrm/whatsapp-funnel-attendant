import { ChevronLeft, ChevronRight } from 'lucide-react';

import { formatBRL } from '../../../lib/money.ts';
import ItemImage from '../ItemImage/ItemImage.tsx';

import type { MenuItem } from '../../../api/menu/menu.ts';

interface ItemCardProps {
  item: MenuItem;
  labels: {
    noPrice: string;
    moveLeft: string;
    moveRight: string;
  };
  onEdit: () => void;
  /** Sem nenhum dos dois, os botões de reordenar não aparecem (ex.: aba "Todos"). */
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}

export function ItemCardSkeleton() {
  return (
    <div
      aria-busy="true"
      data-testid="item-card-skeleton"
      className="flex flex-col rounded-2xl border border-line bg-surface p-2"
    >
      <div className="aspect-[4/3] w-full animate-pulse rounded-xl bg-skeleton" />
      <div className="flex flex-col gap-2 px-2 pb-2 pt-3">
        <div className="h-3 w-16 animate-pulse rounded bg-skeleton" />
        <div className="h-4 w-32 animate-pulse rounded bg-skeleton" />
        <div className="mt-1 flex items-center justify-between">
          <div className="h-5 w-20 animate-pulse rounded bg-skeleton" />
          <div className="h-6 w-24 animate-pulse rounded-full bg-skeleton" />
        </div>
      </div>
    </div>
  );
}

function priceLabel(item: MenuItem, labels: ItemCardProps['labels']): string {
  if (item.sizes.length > 0) {
    const min = Math.min(...item.sizes.map((s) => s.priceCents));
    return formatBRL(min);
  }
  if (item.priceCents !== null) return formatBRL(item.priceCents);
  return labels.noPrice;
}

const MOVE_BUTTON =
  'flex h-6 w-6 items-center justify-center rounded text-fg-subtle transition hover:bg-hover hover:text-fg disabled:opacity-30';

export default function ItemCard({
  item,
  labels,
  onEdit,
  onMoveLeft,
  onMoveRight,
}: ItemCardProps) {
  const showMove = Boolean(onMoveLeft || onMoveRight);

  return (
    // O card inteiro abre a edição (e é lá que se exclui o item).
    <article
      onClick={onEdit}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          e.preventDefault();
          onEdit();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={item.name}
      className="flex cursor-pointer flex-col rounded-2xl border border-line bg-surface p-2 transition hover:border-line-strong"
    >
      <div className="relative">
        <ItemImage
          src={item.imageUrl}
          alt={item.name}
          size="cover"
          className={item.available ? '' : 'opacity-60'}
        />
      </div>

      <div className="flex flex-1 flex-col px-2 pb-2 pt-3">
        <p className="truncate text-sm font-medium text-fg">{item.name}</p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-muted">
            {item.description}
          </p>
        )}
        <p className="mt-3 text-base font-semibold text-fg">
          {priceLabel(item, labels)}
        </p>

        {showMove && (
          <div className="mt-2 flex gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveLeft?.();
              }}
              disabled={!onMoveLeft}
              aria-label={labels.moveLeft}
              className={MOVE_BUTTON}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveRight?.();
              }}
              disabled={!onMoveRight}
              aria-label={labels.moveRight}
              className={MOVE_BUTTON}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
