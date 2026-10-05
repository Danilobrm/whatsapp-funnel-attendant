import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Search,
  SendHorizontal,
} from 'lucide-react';

import WhatsAppIcon from '../../components/WhatsAppIcon/WhatsAppIcon.tsx';
import { useT } from '../../i18n/index.tsx';
import {
  MOCK_CONVERSATIONS,
  type WhatsAppConversation,
  type WhatsAppMessage,
} from './mockConversations.ts';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-10 w-10 text-sm' : 'h-12 w-12 text-base';
  return (
    <span
      aria-hidden="true"
      className={`flex ${sizeClass} flex-none items-center justify-center rounded-full bg-hover font-medium text-fg-muted`}
    >
      {initials(name)}
    </span>
  );
}

function StatusTicks({ message }: { message: WhatsAppMessage }) {
  const t = useT();
  if (message.direction !== 'out' || !message.status) return null;
  const label = t(`whatsapp.status.${message.status}`);
  const Icon = message.status === 'sent' ? Check : CheckCheck;
  return (
    <Icon
      role="img"
      aria-label={label}
      className={`h-3.5 w-3.5 ${message.status === 'read' ? 'text-accent-fg' : 'text-accent-fg/60'}`}
      strokeWidth={2}
    />
  );
}

function MessageBubble({ message }: { message: WhatsAppMessage }) {
  const outgoing = message.direction === 'out';
  return (
    <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
      <div
        data-direction={message.direction}
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed shadow-sm ${
          outgoing
            ? 'rounded-br-md bg-accent text-accent-fg'
            : 'rounded-bl-md border border-line bg-canvas text-fg'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.text}</p>
        <span
          className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${
            outgoing ? 'text-accent-fg/70' : 'text-fg-subtle'
          }`}
        >
          {message.time}
          <StatusTicks message={message} />
        </span>
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: WhatsAppConversation;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  const last = conversation.messages[conversation.messages.length - 1];
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
          selected ? 'bg-hover' : 'hover:bg-hover'
        }`}
      >
        <Avatar name={conversation.name} />
        <span className="flex min-w-0 flex-1 flex-col border-b border-line pb-3">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-medium text-fg">
              {conversation.name}
            </span>
            {last && (
              <span
                className={`flex-none text-[12px] ${
                  conversation.unread > 0 ? 'text-accent' : 'text-fg-subtle'
                }`}
              >
                {last.time}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1 text-[13px] text-fg-muted">
              {last?.direction === 'out' && (
                <span className="flex-none text-fg-subtle">
                  {t('whatsapp.you')}
                </span>
              )}
              <span className="truncate">{last?.text}</span>
            </span>
            {conversation.unread > 0 && (
              <span
                aria-label={t('whatsapp.unread')}
                className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-medium text-accent-fg"
              >
                {conversation.unread}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Réplica do WhatsApp Web no visual do painel: lista de conversas à esquerda,
 * conversa aberta à direita. Por enquanto roda sobre `MOCK_CONVERSATIONS` —
 * enviar só acrescenta a mensagem localmente, nada sai pro Graph API.
 */
export default function WhatsApp() {
  const t = useT();
  const [conversations, setConversations] =
    useState<WhatsAppConversation[]>(MOCK_CONVERSATIONS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    const digits = q.replace(/\D/g, '');
    return conversations.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (digits.length > 0 && c.phone.replace(/\D/g, '').includes(digits)),
    );
  }, [conversations, query]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  function select(id: string) {
    setSelectedId(id);
    setConversations((current) =>
      current.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
    );
  }

  function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selected) return;
    const message: WhatsAppMessage = {
      id: `${selected.id}-local-${Date.now()}`,
      direction: 'out',
      text,
      time: nowHHmm(),
      status: 'sent',
    };
    setConversations((current) =>
      current.map((c) =>
        c.id === selected.id ? { ...c, messages: [...c.messages, message] } : c,
      ),
    );
    setDraft('');
  }

  return (
    <div className="flex h-full min-h-0">
      <aside
        aria-label={t('whatsapp.listLabel')}
        className={`${selected ? 'hidden md:flex' : 'flex'} w-full flex-none flex-col border-r border-line bg-canvas md:w-80 lg:w-96`}
      >
        <div className="border-b border-line px-4 py-4">
          <h1 className="text-xl font-medium text-fg">{t('whatsapp.title')}</h1>
          <label className="mt-3 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-fg-subtle focus-within:ring-1 focus-within:ring-accent">
            <Search
              className="h-4 w-4 flex-none"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('whatsapp.search')}
              aria-label={t('whatsapp.search')}
              className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            />
          </label>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              selected={c.id === selectedId}
              onSelect={() => select(c.id)}
            />
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-fg-muted">
              {t('whatsapp.noResults')}
            </li>
          )}
        </ul>
      </aside>

      <section
        className={`${selected ? 'fixed inset-0 z-40 flex md:static md:z-auto' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-canvas-alt`}
      >
        {selected ? (
          <>
            <header className="flex items-center gap-3 border-b border-line bg-canvas px-4 py-3">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label={t('whatsapp.back')}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover md:hidden"
              >
                <ArrowLeft
                  className="h-4 w-4"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </button>
              <Avatar name={selected.name} size="sm" />
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-medium text-fg">
                  {selected.name}
                </h2>
                <p className="truncate text-[12px] text-fg-muted">
                  {selected.phone}
                </p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-6">
              <div className="flex flex-col gap-2">
                {selected.messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </div>
            </div>

            <form
              onSubmit={send}
              className="flex items-center gap-2 border-t border-line bg-canvas px-4 py-3"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('whatsapp.composer')}
                aria-label={t('whatsapp.composer')}
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={draft.trim().length === 0}
                aria-label={t('common.send')}
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent text-accent-fg transition hover:opacity-90 disabled:opacity-50"
              >
                <SendHorizontal
                  className="h-4 w-4"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-hover text-fg-subtle">
              <WhatsAppIcon className="h-8 w-8" aria-hidden="true" />
            </span>
            <p className="text-base font-medium text-fg">
              {t('whatsapp.emptyTitle')}
            </p>
            <p className="max-w-sm text-sm text-fg-muted">
              {t('whatsapp.emptyHint')}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
