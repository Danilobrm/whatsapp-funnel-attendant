import type { ReactNode } from 'react';

export interface OptionCardItem {
  value: string;
  title: string;
  description?: string;
  icon?: ReactNode;
}

type Columns = 2 | 3 | 4;

// Classes estáticas de propósito — o Tailwind não gera classe pra uma string
// montada em runtime (`sm:grid-cols-${n}` nunca bateria com o scanner do JIT).
const COLUMN_CLASSES: Record<Columns, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

interface OptionCardGroupProps {
  /** Rótulo acessível do grupo — já traduzido pelo chamador. */
  legend: string;
  name: string;
  value: string;
  options: OptionCardItem[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Quantas colunas na largura máxima. Padrão 2. */
  columns?: Columns;
}

export function OptionCardGroupSkeleton({
  options = 3,
  columns = 2,
}: {
  options?: number;
  columns?: Columns;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-3 ${COLUMN_CLASSES[columns]}`}
      aria-busy="true"
      data-testid="option-card-group-skeleton"
    >
      {Array.from({ length: options }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line p-4">
          <div className="h-4 w-24 animate-pulse rounded bg-skeleton" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-skeleton" />
          <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-skeleton" />
        </div>
      ))}
    </div>
  );
}

/** Radio group em formato de cards. Um único selecionado por vez. */
export default function OptionCardGroup({
  legend,
  name,
  value,
  options,
  onChange,
  disabled = false,
  columns = 2,
}: OptionCardGroupProps) {
  return (
    // min-w-0: fieldset tem `min-width: min-content` por padrão e estoura o
    // grid do pai, criando uma segunda barra de rolagem (horizontal).
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className={`grid grid-cols-1 gap-3 ${COLUMN_CLASSES[columns]}`}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                selected
                  ? 'border-accent bg-hover'
                  : 'border-line hover:bg-hover'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={option.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              {option.icon && (
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex-none ${
                    selected ? 'text-accent' : 'text-fg-subtle'
                  }`}
                >
                  {option.icon}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">
                  {option.title}
                </span>
                {option.description && (
                  <span className="mt-0.5 block text-[13px] text-fg-muted">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
