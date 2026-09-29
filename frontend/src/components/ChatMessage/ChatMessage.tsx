import type { ReactNode } from 'react';

import { splitLinks } from './linkify.ts';

export type ChatRole = 'user' | 'assistant';

interface ChatMessageProps {
  role: ChatRole;
  content: string;
  pending?: boolean;
  error?: boolean;
  /** Linha discreta dentro do balão (ex.: quem escreveu — persona ou IA). */
  note?: string;
}

/**
 * Balão no estilo WhatsApp. No simulador o dono faz o papel do cliente, então
 * a mensagem dele (`user`) sai à direita, como no celular de quem digita, e a
 * resposta do atendente chega à esquerda. Mesmo visual da aba WhatsApp.
 */
function Bubble({
  role,
  tone = 'default',
  children,
}: {
  role: ChatRole;
  tone?: 'default' | 'error';
  children: ReactNode;
}) {
  const outgoing = role === 'user';
  const toneClass = outgoing
    ? 'rounded-br-md bg-accent text-accent-fg'
    : tone === 'error'
      ? 'rounded-bl-md border border-danger-border bg-danger-bg text-danger'
      : 'rounded-bl-md border border-line bg-canvas text-fg';
  return (
    <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
      <div
        data-role={role}
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed shadow-sm ${toneClass}`}
      >
        {children}
      </div>
    </div>
  );
}

function TypingIndicator({ label }: { label: string }) {
  const trimmed = label.replace(/\.+$/, '').trim();
  return (
    <Bubble role="assistant">
      <span className="flex items-center gap-2 text-fg-subtle">
        {trimmed && <span className="sr-only">{trimmed}</span>}
        <span
          className="typing-dots inline-flex items-end gap-1 py-1.5"
          aria-hidden="true"
        >
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </span>
      </span>
    </Bubble>
  );
}

/** Texto com os links clicáveis (o cardápio em link chega como URL no chat). */
function MessageText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap">
      {splitLinks(text).map((part, index) =>
        part.type === 'link' ? (
          <a
            key={index}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline underline-offset-2"
          >
            {part.value}
          </a>
        ) : (
          part.value
        ),
      )}
    </p>
  );
}

export default function ChatMessage({
  role,
  content,
  pending,
  error,
  note,
}: ChatMessageProps) {
  if (role === 'assistant' && pending)
    return <TypingIndicator label={content} />;

  return (
    <Bubble role={role} tone={error ? 'error' : 'default'}>
      <MessageText text={content} />
      {note && (
        <p className="mt-0.5 text-right text-[11px] text-fg-subtle">{note}</p>
      )}
    </Bubble>
  );
}
