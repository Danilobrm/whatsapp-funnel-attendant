import { useCallback, useEffect, useRef, useState } from 'react';

import {
  SimulatorRejectedError,
  fetchSimulatorCart,
  fetchSimulatorConversation,
  resetSimulatorConversation,
  sendSimulatorMessage,
  type ContactId,
  type HistoryMessage,
  type ReplyProvider,
  type SimulatorCart,
  type ToolCallTrace,
} from '../../api/simulator/simulator.ts';
import { resolveCommand } from '../chatCommands/chatCommands.ts';

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

/**
 * Depuração do agente: o carrinho atual e as ferramentas chamadas no ÚLTIMO
 * turno. Só o simulador tem isso — no WhatsApp o cliente vê apenas a resposta.
 */
export interface SimulatorDebugState {
  cart: SimulatorCart | null;
  toolCalls: ToolCallTrace[];
}

const NO_DEBUG: SimulatorDebugState = { cart: null, toolCalls: [] };

/**
 * `contactId` escolhe a conversa: `null` = a padrão do admin, ou o telefone de
 * um cliente de teste. Trocar refaz a carga (histórico + carrinho) e zera a
 * depuração do turno anterior.
 */
export function useSimulator(contactId: ContactId = null) {
  const [messages, setMessages] = useState<SimulatorMessage[]>([]);
  const [status, setStatus] = useState<SimulatorStatus>('loading');
  const [isSending, setIsSending] = useState(false);
  const [debug, setDebug] = useState<SimulatorDebugState>(NO_DEBUG);
  const mounted = useRef(true);
  // Resposta que chega depois de trocar de cliente não pode cair na conversa nova.
  const activeContact = useRef<ContactId>(contactId);
  const sendingRef = useRef(false);
  /** Quantas mensagens do servidor a tela já conhece (para achar as novas). */
  const knownCount = useRef(0);

  useEffect(() => {
    activeContact.current = contactId;
    mounted.current = true;
    let current = true;
    setStatus('loading');
    setMessages([]);
    setDebug(NO_DEBUG);

    fetchSimulatorConversation(contactId)
      .then((items) => {
        if (!mounted.current || !current) return;
        knownCount.current = items.length;
        setMessages(items.map(fromHistory));
        setStatus('ready');
      })
      .catch(() => {
        if (mounted.current && current) setStatus('error');
      });
    // O carrinho é depuração: falhar em buscá-lo não invalida a conversa.
    fetchSimulatorCart(contactId)
      .then((cart) => {
        if (mounted.current && current) setDebug({ cart, toolCalls: [] });
      })
      .catch(() => undefined);

    return () => {
      current = false;
      mounted.current = false;
    };
  }, [contactId]);

  /**
   * Voltou para a aba (ex.: depois de montar o carrinho na página do cardápio,
   * cuja confirmação chega como mensagem NA conversa): rebusca o histórico e o
   * carrinho. Só troca a lista quando o servidor tem mensagens que a tela não
   * conhece — não descarta avisos locais à toa nem interrompe um envio.
   */
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      if (sendingRef.current) return;
      const asked = activeContact.current;
      fetchSimulatorConversation(asked)
        .then((items) => {
          if (!mounted.current || activeContact.current !== asked) return;
          if (sendingRef.current || items.length <= knownCount.current) return;
          knownCount.current = items.length;
          setMessages(items.map(fromHistory));
        })
        .catch(() => undefined);
      fetchSimulatorCart(asked)
        .then((cart) => {
          if (!mounted.current || activeContact.current !== asked) return;
          setDebug((prev) => (sendingRef.current ? prev : { ...prev, cart }));
        })
        .catch(() => undefined);
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const reset = useCallback(async () => {
    setIsSending(true);
    try {
      await resetSimulatorConversation(contactId);
      if (!mounted.current || activeContact.current !== contactId) return;
      setDebug(NO_DEBUG);
      knownCount.current = 0;
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
  }, [contactId]);

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
      sendingRef.current = true;

      try {
        const result = await sendSimulatorMessage(text, contactId);
        if (!mounted.current || activeContact.current !== contactId) return;
        // O servidor gravou a mensagem do cliente + cada resposta.
        knownCount.current += 1 + result.replies.length;
        if (result.debug) {
          setDebug({
            cart: result.debug.cart,
            toolCalls: result.debug.toolCalls,
          });
        }
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
        if (!mounted.current || activeContact.current !== contactId) return;
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
        sendingRef.current = false;
        if (mounted.current) setIsSending(false);
      }
    },
    [reset, contactId],
  );

  return { messages, status, isSending, send, debug };
}
