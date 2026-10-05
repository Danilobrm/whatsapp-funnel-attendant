import { useEffect, useRef, useState } from 'react';
import { Bug, FlaskConical } from 'lucide-react';

import ChatComposer from '../../components/ChatComposer/ChatComposer.tsx';
import ChatMessage from '../../components/ChatMessage/ChatMessage.tsx';
import CustomerPicker from '../../components/simulator/CustomerPicker.tsx';
import DebugPanel from '../../components/simulator/DebugPanel.tsx';
import { CHAT_COMMANDS } from '../../hooks/chatCommands/chatCommands.ts';
import { useSimulatedCustomers } from '../../hooks/useSimulatedCustomers/useSimulatedCustomers.ts';
import { useSimulator, type SimulatorMessage } from '../../hooks/useSimulator/useSimulator.ts';
import { useT } from '../../i18n/index.tsx';

/** Espelha o limite do backend (`MAX_SIMULATOR_CHARS`). */
const MAX_MESSAGE_CHARS = 1000;

function MessageListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-2">
      <span className="ml-auto block h-10 w-40 animate-pulse rounded-2xl rounded-br-md bg-skeleton" />
      <span className="block h-14 w-72 animate-pulse rounded-2xl rounded-bl-md bg-skeleton" />
    </div>
  );
}

/**
 * Conversa de teste do dono do restaurante. Passa pelo MESMO fluxo do webhook
 * do WhatsApp no backend, então o que aparece aqui é o que o cliente recebe.
 * Cada resposta mostra se veio do texto fixo da persona ou da IA — é o que
 * explica ao dono por que "oi" sempre recebe a mesma frase.
 */
export default function Simulator() {
  const t = useT();
  const [contactId, setContactId] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);
  const { customers, create } = useSimulatedCustomers();
  const { messages, status, isSending, send, debug } = useSimulator(contactId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function textOf(message: SimulatorMessage): string {
    if (message.content !== undefined) return message.content;
    const key = message.contentKey ?? '';
    const text = t(key);
    // t() devolve a chave crua quando ela não existe (code novo do backend).
    return text === key && message.fallbackKey ? t(message.fallbackKey) : text;
  }

  function noteOf(message: SimulatorMessage): string | undefined {
    if (message.role !== 'assistant' || !message.provider) return undefined;
    return t(`simulator.provider.${message.provider}`);
  }

  return (
    <div className="flex h-full flex-col bg-canvas-alt lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-canvas px-4 py-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-hover text-fg-muted"
          >
            <FlaskConical className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-medium text-fg">
              {t('simulator.title')}
            </h1>
            <p className="truncate text-[12px] text-fg-muted">
              {t('simulator.subtitle')}
            </p>
          </div>
          <CustomerPicker
            customers={customers}
            value={contactId}
            onChange={setContactId}
            onCreate={create}
            disabled={isSending}
          />
          <button
            type="button"
            aria-pressed={devMode}
            onClick={() => setDevMode((on) => !on)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
              devMode
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-line bg-canvas text-fg hover:bg-hover'
            }`}
          >
            <Bug className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {t('simulator.debug.toggle')}
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2 px-4 py-6">
            {status === 'loading' && <MessageListSkeleton />}
            {status === 'error' && (
              <p className="text-sm text-danger">{t('simulator.loadError')}</p>
            )}
            {status === 'ready' && messages.length === 0 && (
              <p className="mx-auto rounded-lg bg-canvas px-3 py-1.5 text-center text-[12px] text-fg-muted shadow-sm">
                {t('simulator.empty')}
              </p>
            )}
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                role={m.role}
                content={textOf(m)}
                pending={m.pending}
                error={m.error}
                note={noteOf(m)}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-line bg-canvas px-4 py-3">
          <div className="w-full">
            <ChatComposer
              onSubmit={(text) => void send(text)}
              autoFocus
              disabled={isSending || status === 'loading'}
              maxLength={MAX_MESSAGE_CHARS}
              commands={CHAT_COMMANDS}
            />
          </div>
        </div>
      </div>

      {devMode && (
        <DebugPanel
          cart={debug.cart}
          toolCalls={debug.toolCalls}
          loading={status === 'loading'}
        />
      )}
    </div>
  );
}
