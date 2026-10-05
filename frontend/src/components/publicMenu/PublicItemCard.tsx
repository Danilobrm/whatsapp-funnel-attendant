import { useT } from '../../i18n/index.tsx';
import { fill } from '../../i18n/fill.ts';
import { startingPriceCents } from '../../lib/cartPricing.ts';
import { formatBRL } from '../../lib/money.ts';
import ItemImage from '../menu/ItemImage/ItemImage.tsx';

import type { PublicItem } from '../../api/publicMenu/publicMenu.ts';

export function PublicItemCardSkeleton() {
  return (
    <div
      aria-busy="true"
      data-testid="public-item-skeleton"
      className="flex gap-3 rounded-2xl border border-line bg-surface p-3"
    >
      <div className="h-24 w-24 flex-none animate-pulse rounded-xl bg-skeleton" />
      <div className="flex flex-1 flex-col gap-2 py-1">
        <div className="h-4 w-32 animate-pulse rounded bg-skeleton" />
        <div className="h-3 w-full animate-pulse rounded bg-skeleton" />
        <div className="mt-auto h-4 w-20 animate-pulse rounded bg-skeleton" />
      </div>
    </div>
  );
}

interface PublicItemCardProps {
  item: PublicItem;
  onOpen: () => void;
}

/** Cartão do item: foto, nome, descrição e preço. Esgotado aparece, mas não abre. */
export default function PublicItemCard({ item, onOpen }: PublicItemCardProps) {
  const t = useT();
  const from = startingPriceCents(item);
  const price =
    from === null
      ? null
      : item.sizes.length > 1
        ? fill(t('publicMenu.item.from'), { price: formatBRL(from) })
        : formatBRL(from);

  return (
    <button
      type="button"
      disabled={!item.available}
      onClick={onOpen}
      className="flex w-full gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      <ItemImage src={item.imageUrl} alt={item.name} size="md" />
      <span className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <span className="text-[15px] font-medium text-fg">{item.name}</span>
        {item.description && (
          <span className="line-clamp-2 text-[13px] text-fg-muted">
            {item.description}
          </span>
        )}
        <span className="mt-auto flex items-center justify-between gap-2 pt-1">
          {price && (
            <span className="text-sm font-medium tabular-nums text-fg">
              {price}
            </span>
          )}
          {!item.available && (
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-muted">
              {t('publicMenu.item.soldOut')}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
