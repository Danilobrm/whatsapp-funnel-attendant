import { useCallback, useEffect, useRef, useState } from 'react';

import {
  SimulatorRejectedError,
  fetchSimulatorConversation,
  resetSimulatorConversation,
  sendSimulatorMessage,
  type HistoryMessage,
  type ReplyProvider,
} from '../../api/simulator';
import { resolveCommand } from '../chatCommands';

/**
 * Mensagem na tela. O texto vem OU do servidor (`content`) OU de uma chave de
 * i18n (`contentKey`) — avisos e erros do próprio painel. A página resolve a
 * chave; o hook não conhece idioma, então troca de locale não exige refetch.
 */
export interface SimulatorMessage {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  contentKey?: string;
  /** Chave de fallback quando `contentKey` não existe no dicionário. */
  fallbackKey?: string;
  pending?: boolean;
  error?: boolean;
  provider?: ReplyProvider | null;
}

export type SimulatorStatus = 'loading' | 'ready' | 'error';

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `m${sequence}`;
}

function fromHistory(item: HistoryMessage): SimulatorMessage {
  return {
    id: nextId(),
    role: item.direction === 'inbound' ? 'user' : 'assistant',
    content: item.body,
  };
}

export function useSimulator() {
  const [messages, setMessages] = useState<SimulatorMessage[]>([]);
  const [status, setStatus] = useState<SimulatorStatus>('loading');
  const [isSending, setIsSending] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetchSimulatorConversation()
      .then((items) => {
        if (!mounted.current) return;
        setMessages(items.map(fromHistory));
        setStatus('ready');
      })
      .catch(() => {
        if (mounted.current) setStatus('error');
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const reset = useCallback(async () => {
    setIsSending(true);
    try {
      await resetSimulatorConversation();
      if (!mounted.current) return;
      setMessages([
        { id: nextId(), role: 'assistant', contentKey: 'simulator.resetDone' },
      ]);
    } catch {
      if (!mounted.current) return;
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          contentKey: 'simulator.resetError',
          error: true,
        },
      ]);
    } finally {
      if (mounted.current) setIsSending(false);
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      // Comando do painel nunca vai para o atendente.
      if (resolveCommand(text)?.id === 'reset') {
        await reset();
        return;
      }

      const pendingId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'user', content: text },
        {
          id: pendingId,
          role: 'assistant',
          contentKey: 'chat.thinking',
          pending: true,
        },
      ]);
      setIsSending(true);

      try {
        const result = await sendSimulatorMessage(text);
        if (!mounted.current) return;
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== pendingId),
          ...result.replies.map((reply) => ({
            id: nextId(),
            role: 'assistant' as const,
            content: reply,
            provider: result.provider,
          })),
        ]);
      } catch (err) {
        if (!mounted.current) return;
        // O `message` do erro NUNCA vai para a tela — só o code, via i18n.
        const contentKey =
          err instanceof SimulatorRejectedError
            ? `chat.errors.${err.code}`
            : 'chat.error';
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== pendingId),
          {
            id: nextId(),
            role: 'assistant',
            contentKey,
            fallbackKey: 'chat.error',
            error: true,
          },
        ]);
      } finally {
        if (mounted.current) setIsSending(false);
      }
    },
    [reset],
  );

  return { messages, status, isSending, send };
}
