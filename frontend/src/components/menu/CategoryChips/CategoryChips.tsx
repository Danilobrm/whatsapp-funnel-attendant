import { Check, EyeOff, LayoutGrid, Plus, UtensilsCrossed } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export type CategorySelection = number | 'all';

interface ChipCategory {
  id: number;
  name: string;
  count: number;
  active: boolean;
}

interface CategoryChipsProps {
  categories: ChipCategory[];
  /** Sem o chip "Todos" (ex.: escolher a categoria de um item). */
  showAll?: boolean;
  totalCount?: number;
  selected: CategorySelection;
  onSelect: (selection: CategorySelection) => void;
  /** Sem `onAdd`, o chip de adicionar categoria não aparece. */
  newName?: string;
  onNewNameChange?: (name: string) => void;
  onAdd?: () => void;
  labels: {
    all?: string;
    item: string;
    items: string;
    newPlaceholder?: string;
    add?: string;
    addLabel?: string;
  };
}

const CHIP =
  'flex flex-none snap-start items-center gap-3 rounded-2xl border bg-surface py-3 pl-3 pr-6 text-left transition md:py-2.5 md:pl-2.5 md:pr-5';

export function CategoryChipsSkeleton() {
  return (
    <div
      aria-busy="true"
      data-testid="category-chips-skeleton"
      className="flex gap-3 overflow-hidden pb-1"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${CHIP} border-line`}>
          <div className="h-14 w-14 flex-none animate-pulse md:h-11 md:w-11 rounded-xl bg-skeleton" />
          <div className="flex flex-col gap-1.5">
            <div className="h-4 w-20 animate-pulse rounded bg-skeleton" />
            <div className="h-3 w-12 animate-pulse rounded bg-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CategoryChips({
  categories,
  showAll = true,
  totalCount = 0,
  selected,
  onSelect,
  newName = '',
  onNewNameChange,
  onAdd,
  labels,
}: CategoryChipsProps) {
  const [adding, setAdding] = useState(false);
  const canAdd = newName.trim().length > 0;
  const countLabel = (n: number) =>
    `${n} ${n === 1 ? labels.item : labels.items}`;

  function chip(
    key: string,
    selection: CategorySelection,
    name: string,
    count: number,
    icon: ReactNode,
    muted = false,
  ) {
    const isSelected = selected === selection;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={isSelected}
        onClick={() => onSelect(selection)}
        className={`${CHIP} ${
          isSelected ? 'border-accent' : 'border-line hover:border-line-strong'
        }`}
      >
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-canvas-alt md:h-11 md:w-11 text-fg-muted">
          {icon}
        </span>
        <span className="flex flex-col">
          <span
            className={`flex items-center gap-1.5 whitespace-nowrap text-base font-medium md:text-sm ${
              muted ? 'text-fg-muted' : 'text-fg'
            }`}
          >
            {name}
            {muted && (
              <EyeOff
                className="h-3.5 w-3.5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            )}
          </span>
          <span className="whitespace-nowrap text-sm text-fg-subtle md:text-[13px]">
            {countLabel(count)}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="-mx-4 flex scroll-px-4 snap-x snap-proximity gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:px-0 md:pb-1 [&::-webkit-scrollbar]:hidden">
      {showAll &&
        chip(
          'all',
          'all',
          labels.all ?? '',
          totalCount,
          <LayoutGrid
            className="h-5 w-5"
            strokeWidth={1.75}
            aria-hidden="true"
          />,
        )}
      {categories.map((c) =>
        chip(
          String(c.id),
          c.id,
          c.name,
          c.count,
          <UtensilsCrossed
            className="h-5 w-5"
            strokeWidth={1.75}
            aria-hidden="true"
          />,
          !c.active,
        ),
      )}
      {!onAdd || !onNewNameChange ? null : adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canAdd) return;
            onAdd();
            setAdding(false);
          }}
          className={`${CHIP} border-dashed border-line-strong`}
        >
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-canvas-alt text-fg-muted md:h-11 md:w-11">
            <Plus className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <input
            type="text"
            autoFocus
            value={newName}
            onChange={(e) => onNewNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAdding(false);
            }}
            placeholder={labels.newPlaceholder}
            aria-label={labels.newPlaceholder}
            className="w-44 min-w-0 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle md:text-sm"
          />
          <button
            type="submit"
            disabled={!canAdd}
            aria-label={labels.add}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent text-accent-fg transition hover:opacity-90 disabled:opacity-40"
          >
            <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label={labels.addLabel}
          title={labels.addLabel}
          className="flex flex-none snap-start items-center rounded-2xl border border-dashed border-line-strong bg-surface p-3 text-left transition hover:border-accent md:p-2.5"
        >
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-canvas-alt text-fg-muted md:h-11 md:w-11">
            <Plus className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
        </button>
      )}
    </div>
  );
}
