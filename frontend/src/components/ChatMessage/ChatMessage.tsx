export type ChatRole = 'user' | 'assistant';

interface ChatMessageProps {
  role: ChatRole;
  content: string;
  pending?: boolean;
  error?: boolean;
  /** Linha discreta sob a resposta (ex.: quem escreveu — persona ou IA). */
  note?: string;
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-2xl whitespace-pre-wrap rounded-3xl bg-hover px-5 py-3 text-[15px] text-fg">
        {content}
      </div>
    </div>
  );
}

function TypingIndicator({ label }: { label: string }) {
  const trimmed = label.replace(/\.+$/, '').trim();
  return (
    <div className="flex justify-start">
      <div className="flex max-w-2xl items-center gap-2 px-1 text-[15px] leading-relaxed text-fg-subtle">
        {trimmed && <span>{trimmed}</span>}
        <span className="typing-dots inline-flex items-end gap-1">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </span>
      </div>
    </div>
  );
}

export default function ChatMessage({
  role,
  content,
  pending,
  error,
  note,
}: ChatMessageProps) {
  if (role === 'user') return <UserBubble content={content} />;

  if (pending) return <TypingIndicator label={content} />;

  const toneClass = error ? 'text-danger' : 'text-fg-muted';

  return (
    <div className="flex justify-start">
      <div
        className={`max-w-2xl px-1 text-[15px] leading-relaxed ${toneClass}`}
      >
        <p className="whitespace-pre-wrap">{content}</p>
        {note && <p className="mt-1 text-[11px] text-fg-subtle">{note}</p>}
      </div>
    </div>
  );
}
