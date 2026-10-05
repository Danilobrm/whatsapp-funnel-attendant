import { Trash2 } from 'lucide-react';

import { useT } from '../../i18n/index.tsx';
import { fill } from '../../i18n/fill.ts';
import { formatBRL } from '../../lib/money.ts';
import QuantityStepper from './QuantityStepper.tsx';
import Sheet from './Sheet.tsx';

import type { CartProblem } from '../../api/publicMenu/publicMenu.ts';
import type { DisplayCart } from '../../lib/cartPricing.ts';
import type { ConfirmFailure } from '../../hooks/usePublicMenu/usePublicMenu.ts';

interface CartSheetProps {
  cart: DisplayCart;
  minOrderCents: number;
  confirming: boolean;
  failure: ConfirmFailure | null;
  onQuantity: (index: number, quantity: number) => void;
  onRemove: (index: number) => void;
  onConfirm: () => void;
  onClose: () => void;
}

function problemText(problem: CartProblem, t: (key: string) => string): string {
  const key = `publicMenu.problems.${problem.code}`;
  const text = t(key);
  // t() devolve a chave crua quando ela não existe (code novo do backend).
  return text === key ? t('publicMenu.errors.cart_invalid') : text;
}

/** Carrinho: revisar, mudar quantidades, remover e confirmar. */
export default function CartSheet({
  cart,
  minOrderCents,
  confirming,
  failure,
  onQuantity,
  onRemove,
  onConfirm,
  onClose,
}: CartSheetProps) {
  const t = useT();
  const empty = cart.lines.length === 0 && cart.unavailable.length === 0;
  const belowMinimum = cart.subtotalCents < minOrderCents;
  const blocked =
    empty ||
    cart.lines.length === 0 ||
    cart.unavailable.length > 0 ||
    belowMinimum ||
    confirming;

  const failureKey = failure ? `publicMenu.errors.${failure.code}` : null;
  const failureText =
    failure && failureKey
      ? t(failureKey) === failureKey
        ? t('publicMenu.errors.generic')
        : t(failureKey)
      : null;

  return (
    <Sheet
      title={t('publicMenu.cart.title')}
      closeLabel={t('publicMenu.cart.close')}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <dl className="flex items-baseline justify-between text-[15px]">
            <dt className="text-fg-muted">{t('publicMenu.cart.subtotal')}</dt>
            <dd className="font-medium tabular-nums text-fg">
              {formatBRL(cart.subtotalCents)}
            </dd>
          </dl>
          {belowMinimum && cart.lines.length > 0 && (
            <p role="status" className="text-[12px] text-fg-muted">
              {fill(t('publicMenu.cart.minOrder'), {
                value: formatBRL(minOrderCents),
              })}
            </p>
          )}
          {failureText && (
            <p role="alert" className="text-[13px] text-danger">
              {failureText}
            </p>
          )}
          <p className="text-[12px] text-fg-subtle">
            {t('publicMenu.cart.next')}
          </p>
          <button
            type="button"
            disabled={blocked}
            onClick={onConfirm}
            className="w-full rounded-2xl bg-accent px-4 py-3 text-[15px] font-medium text-accent-fg transition disabled:opacity-40"
          >
            {confirming
              ? t('publicMenu.cart.confirming')
              : t('publicMenu.cart.confirm')}
          </button>
        </div>
      }
    >
      {empty ? (
        <p className="py-6 text-center text-sm text-fg-muted">
          {t('publicMenu.cart.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {cart.lines.map((l) => {
            const problems =
              failure?.problems.filter((p) => p.lineIndex === l.index) ?? [];
            const name = l.sizeName
              ? `${l.item.name} ${l.sizeName}`
              : l.item.name;
            return (
              <li
                key={l.index}
                className="flex flex-col gap-2 border-b border-line pb-4 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{name}</p>
                    {l.optionNames.length > 0 && (
                      <p className="text-[12px] text-fg-muted">
                        {l.optionNames.join(' · ')}
                      </p>
                    )}
                    {l.line.notes && (
                      <p className="text-[12px] text-fg-muted">
                        {l.line.notes}
                      </p>
                    )}
                  </div>
                  <span className="flex-none text-sm tabular-nums text-fg">
                    {formatBRL(l.totalCents)}
                  </span>
                </div>
                {problems.map((p) => (
                  <p
                    key={p.code}
                    role="alert"
                    className="text-[12px] text-danger"
                  >
                    {problemText(p, t)}
                  </p>
                ))}
                <div className="flex items-center justify-between">
                  <QuantityStepper
                    min={0}
                    value={l.line.quantity}
                    onChange={(q) => onQuantity(l.index, q)}
                    decreaseLabel={t('publicMenu.sheet.decrease')}
                    increaseLabel={t('publicMenu.sheet.increase')}
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(l.index)}
                    aria-label={fill(t('publicMenu.cart.remove'), { name })}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition hover:bg-hover"
                  >
                    <Trash2
                      className="h-4 w-4"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </li>
            );
          })}
          {cart.unavailable.map((index) => (
            <li
              key={`gone-${index}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-danger-border bg-danger-bg px-3 py-2"
            >
              <p role="alert" className="text-[13px] text-danger">
                {t('publicMenu.cart.unavailableLine')}
              </p>
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={fill(t('publicMenu.cart.remove'), {
                  name: t('publicMenu.item.soldOut'),
                })}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-danger transition hover:bg-hover"
              >
                <Trash2
                  className="h-4 w-4"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
