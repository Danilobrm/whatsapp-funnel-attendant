import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { ArrowUp } from 'lucide-react';

import { matchCommands, type ChatCommand } from '../../hooks/chatCommands';
import { useT } from '../../i18n/index.tsx';

interface ChatComposerProps {
  onSubmit: (text: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  /** Itens do menu de barra. Vazio = composer comum. */
  commands?: readonly ChatCommand[];
  /** Rótulo acessível do menu. Default: os comandos do painel. */
  commandsTitle?: string;
  /** Modo controlado — parent computa comandos dinâmicos a partir do valor. */
  value?: string;
  onValueChange?: (value: string) => void;
  /**
   * Valor alternativo passado ao matcher de comandos. Usado quando o valor
   * exibido tem prefixo próprio (`/menu foo`) mas o matcher precisa ver só a
   * cauda (`/foo`). Sem isto, o filtro tenta casar o prefixo.
   */
  matchValue?: string;
  /** Caractere que abre o menu. Default `/`. */
  commandPrefix?: string;
}

const DEFAULT_MAX_LENGTH = 200;

export default function ChatComposer({
  onSubmit,
  autoFocus = false,
  disabled = false,
  maxLength = DEFAULT_MAX_LENGTH,
  placeholder,
  commands = [],
  commandsTitle,
  value: controlledValue,
  onValueChange,
  matchValue,
  commandPrefix = '/',
}: ChatComposerProps) {
  const t = useT();
  const [internalValue, setInternalValue] = useState('');
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;
  const valueForMatch = matchValue ?? value;
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeItemRef = useRef<HTMLLIElement | null>(null);
  const hasCommands = commands.length > 0;
  const suggestions = hasCommands
    ? matchCommands(valueForMatch, commands, commandPrefix)
    : [];
  const showCommands = suggestions.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions.length, showCommands]);

  useEffect(() => {
    if (showCommands && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, showCommands]);
  // Onde há comandos, o placeholder também ensina o atalho — senão o `/`
  // fica sendo um recurso escondido que ninguém descobre.
  const defaultPlaceholder = hasCommands
    ? t('chat.commands.placeholder')
    : t('common.ask');

  const setValue = (next: string) => {
    const clipped = next.length > maxLength ? next.slice(0, maxLength) : next;
    if (!isControlled) setInternalValue(clipped);
    onValueChange?.(clipped);
  };
  const canSend =
    !disabled && value.trim().length > 0 && value.length <= maxLength;
  const remaining = maxLength - value.length;
  const showCounter = remaining <= Math.min(80, Math.floor(maxLength * 0.1));

  const MAX_TEXTAREA_HEIGHT_PX = 232;
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX);
    el.style.height = `${next}px`;
  }, [value]);

  function submit() {
    if (!canSend) return;
    onSubmit(value.trim());
    setValue('');
  }

  function pickCommand(command: ChatCommand) {
    // `expand` mantém o menu aberto pra próximo nível (menu em cascata). Sem
    // `expand`, escolher envia direto.
    if (command.expand !== undefined) {
      const next = command.expand.endsWith(' ')
        ? command.expand
        : `${command.expand} `;
      setValue(next);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(next.length, next.length);
        }
      });
      return;
    }
    // Comando do painel envia o próprio gatilho; sugestão envia o texto em
    // linguagem natural, que é o que o atendente sabe responder.
    onSubmit(command.submit ?? command.trigger);
    setValue('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (showCommands && suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((idx) => (idx + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(
          (idx) => (idx - 1 + suggestions.length) % suggestions.length,
        );
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const cmd = suggestions[activeIndex] ?? suggestions[0];
        if (cmd) pickCommand(cmd);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const cmd = suggestions[activeIndex] ?? suggestions[0];
      if (showCommands && cmd) {
        pickCommand(cmd);
        return;
      }
      submit();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="relative flex w-full items-end gap-2 rounded-3xl border border-line bg-surface py-3 pl-5 pr-2 shadow-sm transition focus-within:border-line-strong"
    >
      {showCommands && (
        <div
          role="listbox"
          aria-label={commandsTitle ?? t('chat.commands.title')}
          className="absolute bottom-full left-0 z-10 mb-2 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-lg"
        >
          <ul>
            {suggestions.map((command, idx) => {
              const isActive = idx === activeIndex;
              const label = command.label ?? t(command.labelKey ?? '');
              const description =
                command.description ??
                (command.descriptionKey
                  ? t(command.descriptionKey)
                  : undefined);
              return (
                <li key={command.id} ref={isActive ? activeItemRef : undefined}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => pickCommand(command)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`block w-full px-4 py-2.5 text-left transition ${
                      isActive ? 'bg-hover' : 'hover:bg-hover'
                    }`}
                  >
                    <span className="block text-[13px] font-medium text-fg">
                      {label}
                    </span>
                    {description && (
                      <span className="block text-[12px] text-fg-muted">
                        {description}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <textarea
        ref={textareaRef}
        rows={1}
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={maxLength}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? defaultPlaceholder}
        className="block max-h-[232px] w-full resize-none self-center overflow-y-auto bg-transparent py-1 text-[15px] leading-relaxed text-fg placeholder:text-fg-subtle focus:outline-none disabled:cursor-not-allowed"
      />

      {showCounter && (
        <span
          className={`self-end pb-2 text-[11px] tabular-nums ${
            remaining <= 0 ? 'text-danger' : 'text-fg-subtle'
          }`}
        >
          {remaining}
        </span>
      )}

      <button
        type="submit"
        disabled={!canSend}
        title={t('common.send')}
        aria-label={t('common.send')}
        className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-hover disabled:text-fg-subtle"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </form>
  );
}
