import { Minus, Plus } from 'lucide-react';

import { MAX_LINE_QUANTITY } from '../../lib/cartPricing.ts';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  /** Mínimo (1 no item; 0 no carrinho, onde zerar remove a linha). */
  min?: number;
}

const BUTTON =
  'flex h-9 w-9 items-center justify-center rounded-full border border-line bg-canvas text-fg transition hover:bg-hover disabled:opacity-40';

export default function QuantityStepper({
  value,
  onChange,
  decreaseLabel,
  increaseLabel,
  min = 1,
}: QuantityStepperProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className={BUTTON}
      >
        <Minus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
      <span
        aria-live="polite"
        className="min-w-6 text-center text-[15px] tabular-nums text-fg"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={value >= MAX_LINE_QUANTITY}
        onClick={() => onChange(value + 1)}
        className={BUTTON}
      >
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
