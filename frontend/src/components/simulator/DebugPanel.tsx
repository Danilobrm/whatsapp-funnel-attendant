import { CircleAlert, CircleCheck } from 'lucide-react';

import { useT } from '../../i18n/index.tsx';
import { fill } from '../../i18n/fill.ts';
import { formatBRL } from '../../lib/money.ts';

import type { SimulatorCart, ToolCallTrace } from '../../api/simulator/simulator.ts';

interface DebugPanelProps {
  cart: SimulatorCart | null;
  toolCalls: ToolCallTrace[];
  /** O carrinho chega junto com a conversa: enquanto ela carrega, esqueleto NELE. */
  loading: boolean;
}

/** Mesma forma do carrinho carregado: título, três linhas e o total. */
export function CartSkeleton() {
  return (
    <div aria-busy="true" className="space-y-2">
      <span className="block h-4 w-24 animate-pulse rounded bg-skeleton" />
      <span className="block h-4 w-full animate-pulse rounded bg-skeleton" />
      <span className="block h-4 w-5/6 animate-pulse rounded bg-skeleton" />
      <span className="block h-5 w-1/2 animate-pulse rounded bg-skeleton" />
    </div>
  );
}

function Cart({ cart }: { cart: SimulatorCart }) {
  const t = useT();
  return (
    <div className="space-y-3 text-[13px] text-fg">
      <p className="text-[12px] text-fg-muted">
        {t(`simulator.debug.status.${cart.status}`)}
      </p>

      <ul className="space-y-2">
        {cart.lines.map((line) => (
          <li key={line.number}>
            <div className="flex justify-between gap-2">
              <span>
                {fill(t('simulator.debug.quantity'), { n: line.quantity })}{' '}
                {line.size ? `${line.name} ${line.size}` : line.name}
              </span>
              <span className="flex-none tabular-nums">
                {formatBRL(line.totalCents)}
              </span>
            </div>
            {line.options.length > 0 && (
              <p className="text-[12px] text-fg-muted">
                {line.options.join(' · ')}
              </p>
            )}
            {line.notes && (
              <p className="text-[12px] text-fg-muted">{line.notes}</p>
            )}
          </li>
        ))}
      </ul>

      <dl className="space-y-0.5 border-t border-line pt-2">
        <div className="flex justify-between">
          <dt className="text-fg-muted">{t('simulator.debug.subtotal')}</dt>
          <dd className="tabular-nums">{formatBRL(cart.subtotalCents)}</dd>
        </div>
        {cart.fulfillment === 'delivery' && (
          <div className="flex justify-between">
            <dt className="text-fg-muted">{t('simulator.debug.fee')}</dt>
            <dd className="tabular-nums">{formatBRL(cart.feeCents)}</dd>
          </div>
        )}
        <div className="flex justify-between font-medium">
          <dt>{t('simulator.debug.total')}</dt>
          <dd className="tabular-nums">{formatBRL(cart.totalCents)}</dd>
        </div>
      </dl>

      <div className="space-y-0.5 text-[12px] text-fg-muted">
        <p>
          {cart.fulfillment === null
            ? t('simulator.debug.noFulfillment')
            : `${t(`simulator.debug.${cart.fulfillment}`)}${cart.address ? `: ${cart.address}` : ''}`}
        </p>
        {cart.payment && (
          <p>
            {t('simulator.debug.payment')}: {cart.payment}
            {cart.changeFor
              ? ` (${fill(t('simulator.debug.changeFor'), { value: cart.changeFor })})`
              : ''}
          </p>
        )}
      </div>

      {cart.pending.length > 0 && (
        <div className="rounded-lg border border-line bg-canvas-alt p-2">
          <p className="text-[12px] font-medium text-fg-muted">
            {t('simulator.debug.pending')}
          </p>
          <ul className="mt-1 list-disc pl-4 text-[12px] text-fg-muted">
            {cart.pending.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ToolCall({ call }: { call: ToolCallTrace }) {
  const t = useT();
  const failed = call.result.ok === false;
  const Icon = failed ? CircleAlert : CircleCheck;
  return (
    <li>
      <details className="rounded-lg border border-line bg-canvas">
        <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-[12px] text-fg">
          {/* Estado em texto E ícone: nunca só cor. */}
          <Icon
            className={`h-4 w-4 flex-none ${failed ? 'text-danger' : 'text-success'}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <code className="font-mono">{call.name}</code>
          <span className="ml-auto text-fg-muted">
            {failed
              ? `${t('simulator.debug.toolFailed')}: ${String(call.result.error ?? '')}`
              : t('simulator.debug.toolOk')}
          </span>
        </summary>
        <div className="space-y-2 border-t border-line p-2">
          <div>
            <p className="text-[11px] text-fg-muted">
              {t('simulator.debug.arguments')}
            </p>
            <pre className="overflow-x-auto text-[11px] text-fg">
              {JSON.stringify(call.args, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-[11px] text-fg-muted">
              {t('simulator.debug.result')}
            </p>
            <pre className="max-h-48 overflow-auto text-[11px] text-fg">
              {JSON.stringify(call.result, null, 2)}
            </pre>
          </div>
        </div>
      </details>
    </li>
  );
}

/**
 * Depuração do agente ao lado da conversa: o carrinho como o sistema o vê e
 * as ferramentas que o modelo chamou no último turno. Só existe no simulador.
 */
export default function DebugPanel({
  cart,
  toolCalls,
  loading,
}: DebugPanelProps) {
  const t = useT();
  return (
    <aside
      aria-label={t('simulator.debug.title')}
      className="flex h-full w-full flex-col gap-5 overflow-y-auto border-line bg-surface p-4 lg:w-80 lg:flex-none lg:border-l"
    >
      <h2 className="text-[13px] font-medium text-fg">
        {t('simulator.debug.title')}
      </h2>

      <section className="space-y-2">
        <h3 className="text-[12px] font-medium uppercase tracking-wide text-fg-muted">
          {t('simulator.debug.cart')}
        </h3>
        {loading ? (
          <CartSkeleton />
        ) : cart ? (
          <Cart cart={cart} />
        ) : (
          <p className="text-[13px] text-fg-muted">
            {t('simulator.debug.cartEmpty')}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-[12px] font-medium uppercase tracking-wide text-fg-muted">
          {t('simulator.debug.tools')}
        </h3>
        {toolCalls.length === 0 ? (
          <p className="text-[13px] text-fg-muted">
            {t('simulator.debug.toolsEmpty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {toolCalls.map((call, index) => (
              <ToolCall key={`${call.name}-${index}`} call={call} />
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
