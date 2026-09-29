import { useMemo, useState } from 'react';

import { useT } from '../../i18n/index.tsx';
import { fill } from '../../i18n/fill.ts';
import {
  MAX_LINE_QUANTITY,
  selectionIssues,
  unitPriceCents,
} from '../../lib/cartPricing.ts';
import { formatBRL } from '../../lib/money.ts';
import ItemImage from '../menu/ItemImage/ItemImage.tsx';
import QuantityStepper from './QuantityStepper.tsx';
import Sheet from './Sheet.tsx';

import type { CartLine, PublicGroup, PublicItem } from '../../api/publicMenu/publicMenu.ts';

interface ItemSheetProps {
  item: PublicItem;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}

const CHOICE =
  'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50';

function groupRule(group: PublicGroup, t: (key: string) => string): string {
  const required = group.minSelect > 0;
  const kind = required
    ? t('publicMenu.sheet.required')
    : t('publicMenu.sheet.optional');
  const amount =
    group.minSelect === group.maxSelect
      ? fill(t('publicMenu.sheet.chooseN'), { n: group.maxSelect })
      : fill(t('publicMenu.sheet.upTo'), { n: group.maxSelect });
  return `${kind} · ${amount}`;
}

/**
 * Escolha de UM item: tamanho, grupos de opções (sabores, borda, adicionais),
 * quantidade e observação, com o preço ao vivo. O botão só habilita quando a
 * escolha vale (mesmas regras do backend); o servidor confere de novo.
 */
export default function ItemSheet({ item, onClose, onAdd }: ItemSheetProps) {
  const t = useT();
  const [sizeId, setSizeId] = useState<number | null>(null);
  const [optionIds, setOptionIds] = useState<number[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const selection = useMemo(() => ({ sizeId, optionIds }), [sizeId, optionIds]);
  const issues = selectionIssues(item, selection);
  const unit = unitPriceCents(item, selection);
  const total = unit === null ? null : unit * quantity;

  function toggle(group: PublicGroup, optionId: number) {
    setOptionIds((current) => {
      if (current.includes(optionId)) {
        return current.filter((id) => id !== optionId);
      }
      // Grupo de escolha única troca a opção em vez de bloquear.
      if (group.maxSelect === 1) {
        const others = group.options.map((o) => o.id);
        return [...current.filter((id) => !others.includes(id)), optionId];
      }
      return [...current, optionId];
    });
  }

  /** Primeiro motivo de o botão estar desligado, em texto (nunca só cor). */
  function blocker(): string | null {
    const issue = issues[0];
    if (!issue) return null;
    if (issue.kind === 'size_required') return t('publicMenu.sheet.pickSize');
    const group = item.optionGroups.find((g) => g.id === issue.groupId);
    if (issue.kind === 'group_min') {
      return fill(t('publicMenu.sheet.pickMore'), {
        n: issue.missing,
        group: group?.name ?? '',
      });
    }
    return fill(t('publicMenu.sheet.tooMany'), {
      n: group?.maxSelect ?? 0,
      group: group?.name ?? '',
    });
  }

  const blocked = blocker();
  const canAdd = item.available && issues.length === 0 && total !== null;

  function add() {
    if (!canAdd) return;
    onAdd({
      itemId: item.id,
      sizeId,
      optionIds,
      quantity,
      notes: notes.trim() === '' ? null : notes.trim(),
    });
    onClose();
  }

  return (
    <Sheet
      title={item.name}
      closeLabel={t('publicMenu.sheet.close')}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {blocked && (
            <p role="status" className="text-[12px] text-fg-muted">
              {blocked}
            </p>
          )}
          {!item.available && (
            <p role="status" className="text-[12px] text-fg-muted">
              {t('publicMenu.sheet.unavailable')}
            </p>
          )}
          <button
            type="button"
            disabled={!canAdd}
            onClick={add}
            className="w-full rounded-2xl bg-accent px-4 py-3 text-[15px] font-medium text-accent-fg transition disabled:opacity-40"
          >
            {fill(t('publicMenu.sheet.add'), {
              price: total === null ? '—' : formatBRL(total),
            })}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <ItemImage src={item.imageUrl} alt={item.name} size="cover" />
        {item.description && (
          <p className="text-sm text-fg-muted">{item.description}</p>
        )}

        {item.sizes.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 flex w-full items-baseline justify-between text-sm font-medium text-fg">
              {t('publicMenu.sheet.size')}
              <span className="text-[12px] font-normal text-fg-subtle">
                {t('publicMenu.sheet.required')}
              </span>
            </legend>
            {item.sizes.map((size) => {
              const selected = sizeId === size.id;
              return (
                <button
                  key={size.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSizeId(size.id)}
                  className={`${CHOICE} ${
                    selected
                      ? 'border-accent bg-hover text-fg'
                      : 'border-line bg-canvas text-fg hover:bg-hover'
                  }`}
                >
                  <span>{size.name}</span>
                  <span className="tabular-nums text-fg-muted">
                    {formatBRL(size.priceCents)}
                  </span>
                </button>
              );
            })}
          </fieldset>
        )}

        {item.optionGroups.map((group) => {
          const chosen = group.options.filter((o) =>
            optionIds.includes(o.id),
          ).length;
          const full = chosen >= group.maxSelect && group.maxSelect > 1;
          const single = group.maxSelect === 1;
          return (
            <fieldset key={group.id} className="flex flex-col gap-2">
              <legend className="mb-1 flex w-full items-baseline justify-between gap-2 text-sm font-medium text-fg">
                {group.name}
                <span className="text-[12px] font-normal text-fg-subtle">
                  {groupRule(group, t)}
                  {group.maxSelect > 1 &&
                    ` · ${fill(t('publicMenu.sheet.chosen'), { n: chosen, max: group.maxSelect })}`}
                </span>
              </legend>
              {group.pricingRule === 'average' && (
                <p className="text-[12px] text-fg-muted">
                  {t('publicMenu.sheet.averageNote')}
                </p>
              )}
              {group.options.map((option) => {
                const selected = optionIds.includes(option.id);
                const disabled = !option.available || (!selected && full);
                return (
                  <button
                    key={option.id}
                    type="button"
                    role={single ? 'radio' : 'checkbox'}
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => toggle(group, option.id)}
                    className={`${CHOICE} ${
                      selected
                        ? 'border-accent bg-hover text-fg'
                        : 'border-line bg-canvas text-fg hover:bg-hover'
                    }`}
                  >
                    <span>
                      {option.name}
                      {!option.available && (
                        <span className="ml-2 text-[12px] text-fg-subtle">
                          {t('publicMenu.sheet.soldOutOption')}
                        </span>
                      )}
                    </span>
                    {option.priceCents > 0 && (
                      <span className="tabular-nums text-fg-muted">
                        +{formatBRL(option.priceCents)}
                      </span>
                    )}
                  </button>
                );
              })}
            </fieldset>
          );
        })}

        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          {t('publicMenu.sheet.notes')}
          <textarea
            rows={2}
            maxLength={200}
            value={notes}
            placeholder={t('publicMenu.sheet.notesPlaceholder')}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm font-normal text-fg outline-none focus:border-accent"
          />
        </label>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg">
            {t('publicMenu.sheet.quantity')}
          </span>
          <QuantityStepper
            value={quantity}
            onChange={(v) => setQuantity(Math.min(MAX_LINE_QUANTITY, v))}
            decreaseLabel={t('publicMenu.sheet.decrease')}
            increaseLabel={t('publicMenu.sheet.increase')}
          />
        </div>
      </div>
    </Sheet>
  );
}
