import { CircleCheck } from 'lucide-react';

import { useT } from '../../i18n/index.tsx';
import { formatBRL } from '../../lib/money.ts';

import type { ConfirmedCart } from '../../api/publicMenu/publicMenu.ts';

interface ConfirmedScreenProps {
  cart: ConfirmedCart;
  onEdit: () => void;
}

/**
 * Depois de "Confirmar itens": o carrinho já está na conversa. O botão
 * "Voltar ao WhatsApp" abre o chat com um texto pré-preenchido; sem número
 * cadastrado (ou no simulador) só se pede para voltar à conversa. Se o aviso
 * no chat falhou, o texto pede que o cliente mande uma mensagem.
 */
export default function ConfirmedScreen({
  cart,
  onEdit,
}: ConfirmedScreenProps) {
  const t = useT();
  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 py-10 text-center">
      <CircleCheck
        className="h-14 w-14 text-success"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-medium text-fg">
          {t('publicMenu.confirmed.title')}
        </h1>
        <p className="text-sm text-fg-muted">
          {cart.notified
            ? t('publicMenu.confirmed.text')
            : t('publicMenu.confirmed.notNotified')}
        </p>
      </div>

      <ul className="w-full divide-y divide-line rounded-2xl border border-line bg-surface text-left text-sm">
        {cart.lines.map((line, index) => (
          <li key={index} className="flex justify-between gap-3 px-4 py-2.5">
            <span className="text-fg">
              {line.quantity}x{' '}
              {line.sizeName ? `${line.name} ${line.sizeName}` : line.name}
            </span>
            <span className="tabular-nums text-fg-muted">
              {formatBRL(line.totalCents)}
            </span>
          </li>
        ))}
        <li className="flex justify-between gap-3 px-4 py-2.5 font-medium">
          <span className="text-fg">{t('publicMenu.confirmed.subtotal')}</span>
          <span className="tabular-nums text-fg">
            {formatBRL(cart.subtotalCents)}
          </span>
        </li>
      </ul>

      {cart.whatsappUrl ? (
        <a
          href={cart.whatsappUrl}
          className="w-full rounded-2xl bg-accent px-4 py-3 text-[15px] font-medium text-accent-fg"
        >
          {t('publicMenu.confirmed.back')}
        </a>
      ) : (
        <p className="text-sm text-fg-muted">
          {t('publicMenu.confirmed.backNoNumber')}
        </p>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="text-sm text-fg-muted underline-offset-2 hover:underline"
      >
        {t('publicMenu.confirmed.edit')}
      </button>
    </section>
  );
}
