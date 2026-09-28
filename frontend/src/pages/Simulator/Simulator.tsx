import { useEffect, useRef } from 'react';

import ChatComposer from '../../components/ChatComposer';
import ChatMessage from '../../components/ChatMessage';
import { CHAT_COMMANDS } from '../../hooks/chatCommands';
import { useSimulator, type SimulatorMessage } from '../../hooks/useSimulator';
import { useT } from '../../i18n/index.tsx';

/** Espelha o limite do backend (`MAX_SIMULATOR_CHARS`). */
const MAX_MESSAGE_CHARS = 1000;

function MessageListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="ml-auto block h-10 w-40 animate-pulse rounded-3xl bg-skeleton" />
      <span className="block h-5 w-72 animate-pulse rounded bg-skeleton" />
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
  const { messages, status, isSending, send } = useSimulator();
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
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-8 py-5">
        <h1 className="text-xl font-medium text-fg">{t('simulator.title')}</h1>
        <p className="text-sm text-fg-muted">{t('simulator.subtitle')}</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
          {status === 'loading' && <MessageListSkeleton />}
          {status === 'error' && (
            <p className="text-sm text-danger">{t('simulator.loadError')}</p>
          )}
          {status === 'ready' && messages.length === 0 && (
            <p className="text-center text-sm text-fg-muted">
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

      <div className="border-t border-line pb-6 pt-4">
        <div className="mx-auto w-full max-w-3xl px-6">
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
  );
}
