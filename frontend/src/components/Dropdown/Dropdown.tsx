import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  id?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

/**
 * Substituto de `<select>` com a MESMA casca visual dos inputs de texto
 * (`rounded-xl border border-line bg-canvas`) — o `<select>` nativo não dá
 * pra estilizar sem cair no chevron feio do navegador. Padrão ARIA listbox:
 * https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
 */
export default function Dropdown({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  'aria-label': ariaLabel,
  className = '',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];
  const baseId = id ?? 'dropdown';

  useEffect(() => {
    if (!open) return;

    function onDocMouseDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setHighlighted(selectedIndex >= 0 ? selectedIndex : 0);
    listRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`${baseId}-option-${highlighted}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted, baseId]);

  function commit(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onButtonKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((h) => Math.min(options.length - 1, h + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setHighlighted(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setHighlighted(options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commit(highlighted);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${baseId}-listbox` : undefined}
        aria-activedescendant={
          open ? `${baseId}-option-${highlighted}` : undefined
        }
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-left text-sm text-fg outline-none transition focus:border-accent disabled:opacity-60"
      >
        <span className={`truncate ${selected ? 'text-fg' : 'text-fg-subtle'}`}>
          {selected ? selected.label : (placeholder ?? '')}
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-none text-fg-subtle transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${baseId}-listbox`}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          onKeyDown={onListKeyDown}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-line bg-surface py-1 text-sm shadow-lg focus:outline-none"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${baseId}-option-${index}`}
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => commit(index)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 transition ${
                index === highlighted ? 'bg-hover' : ''
              } ${option.value === value ? 'text-accent' : 'text-fg'}`}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value && (
                <Check
                  className="h-4 w-4 flex-none"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
