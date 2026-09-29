import { useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';

import {
  SimulatorRejectedError,
  type SimulatedCustomer,
} from '../../api/simulator/simulator.ts';
import { useT } from '../../i18n/index.tsx';
import Dropdown from '../Dropdown/Dropdown.tsx';

/** Valor do Dropdown para a conversa padrão do admin (não é um telefone). */
const DEFAULT_VALUE = '__default__';

interface CustomerPickerProps {
  customers: SimulatedCustomer[];
  /** `null` = conversa padrão do admin. */
  value: string | null;
  onChange: (contactId: string | null) => void;
  onCreate: (input: {
    name: string;
    phone: string;
  }) => Promise<SimulatedCustomer>;
  disabled?: boolean;
}

/**
 * Escolhe com QUEM a conversa de teste acontece: o cliente padrão do admin ou
 * um cliente de teste (nome + telefone fictício). Cada um tem conversa,
 * carrinho e pedidos próprios — é o que permite testar cliente recorrente e
 * vários pedidos simultâneos no balcão sem WhatsApp.
 */
export default function CustomerPicker({
  customers,
  value,
  onChange,
  onCreate,
  disabled = false,
}: CustomerPickerProps) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const options = [
    { value: DEFAULT_VALUE, label: t('simulator.customers.default') },
    ...customers.map((c) => ({
      value: c.contactId,
      label: c.name ? `${c.name} · ${c.phone}` : c.phone,
    })),
  ];

  function close() {
    setAdding(false);
    setName('');
    setPhone('');
    setErrorKey(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorKey(null);
    try {
      const customer = await onCreate({ name, phone });
      onChange(customer.contactId);
      close();
    } catch (err) {
      // O `message` do erro NUNCA vai para a tela — só o code, via i18n.
      const generic = 'simulator.customers.errors.generic';
      if (err instanceof SimulatorRejectedError) {
        const key = `simulator.customers.errors.${err.code}`;
        setErrorKey(t(key) === key ? generic : key);
      } else {
        setErrorKey(generic);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Dropdown
          id="simulator-customer"
          aria-label={t('simulator.customers.label')}
          className="w-56"
          value={value ?? DEFAULT_VALUE}
          options={options}
          disabled={disabled}
          onChange={(next) => onChange(next === DEFAULT_VALUE ? null : next)}
        />
        <button
          type="button"
          onClick={() => setAdding((open) => !open)}
          aria-expanded={adding}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg transition hover:bg-hover"
        >
          <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {t('simulator.customers.add')}
        </button>
      </div>

      {adding && (
        <form
          onSubmit={(e) => void submit(e)}
          className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3"
        >
          <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
            {t('simulator.customers.name')}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('simulator.customers.namePlaceholder')}
              maxLength={80}
              className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
            {t('simulator.customers.phone')}
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('simulator.customers.phonePlaceholder')}
              inputMode="tel"
              className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            />
          </label>
          {errorKey && (
            <p role="alert" className="text-[12px] text-danger">
              {t(errorKey)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-xl px-3 py-2 text-sm text-fg-muted transition hover:bg-hover"
            >
              {t('simulator.customers.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-accent px-3 py-2 text-sm text-accent-fg transition disabled:opacity-60"
            >
              {submitting
                ? t('simulator.customers.creating')
                : t('simulator.customers.create')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
