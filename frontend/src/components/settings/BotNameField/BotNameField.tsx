interface BotNameFieldProps {
  id?: string;
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  maxLength?: number;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function BotNameFieldSkeleton() {
  return (
    <div aria-busy="true" data-testid="bot-name-skeleton">
      <div className="h-3.5 w-28 animate-pulse rounded bg-skeleton" />
      <div className="mt-2 h-10 w-full animate-pulse rounded-xl bg-skeleton" />
      <div className="mt-2 h-3 w-48 animate-pulse rounded bg-skeleton" />
    </div>
  );
}

export default function BotNameField({
  id = 'bot-name',
  label,
  hint,
  placeholder,
  value,
  maxLength = 60,
  onChange,
  disabled = false,
}: BotNameFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-subtle focus:border-accent disabled:opacity-60"
      />
      {hint && <p className="mt-2 text-[13px] text-fg-muted">{hint}</p>}
    </div>
  );
}
