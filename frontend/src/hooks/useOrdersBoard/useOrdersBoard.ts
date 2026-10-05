import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchOrders,
  transitionOrder,
  type Order,
  type TransitionBody,
} from '../../api/orders/orders.ts';
import {
  openOrderStream,
  type OrderStreamEvent,
} from '../../api/orders/orderStream.ts';

export type StreamConnection = 'connecting' | 'live' | 'reconnecting';

/** Espera entre tentativas: 1s, 2s, 4s, 8s, 15s, 15s… */
export function reconnectDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 15_000);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      window.clearTimeout(id);
      resolve();
    });
  });
}

function upsert(list: Order[], order: Order): Order[] {
  const index = list.findIndex((o) => o.id === order.id);
  if (index === -1) return [...list, order];
  const next = [...list];
  next[index] = order;
  return next;
}

interface UseOrdersBoardOptions {
  /** Pedido novo chegou pelo stream (não dispara na carga inicial). */
  onOrderCreated?: (order: Order) => void;
}

/**
 * Estado do quadro do balcão: carga inicial + stream SSE ao vivo.
 *
 * O stream cai (servidor reiniciou, Wi-Fi do balcão oscilou) e volta
 * sozinho com backoff. Toda (re)conexão refaz o GET: eventos emitidos
 * enquanto estava desconectado se perderam, e a lista é a fonte da verdade.
 */
export function useOrdersBoard({ onOrderCreated }: UseOrdersBoardOptions = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [connection, setConnection] = useState<StreamConnection>('connecting');

  const onCreatedRef = useRef(onOrderCreated);
  onCreatedRef.current = onOrderCreated;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  // Só a resposta do GET mais recente vale (carga inicial x resync).
  const fetchSeq = useRef(0);

  const resync = useCallback(async () => {
    const seq = ++fetchSeq.current;
    try {
      const data = await fetchOrders();
      if (seq !== fetchSeq.current) return;
      setOrders(data.orders);
      setLoadError(false);
    } catch {
      if (seq === fetchSeq.current) setLoadError(true);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  const applyEvent = useCallback((event: OrderStreamEvent) => {
    const isNew = !ordersRef.current.some((o) => o.id === event.order.id);
    setOrders((current) => upsert(current, event.order));
    if (event.type === 'order_created' && isNew) {
      onCreatedRef.current?.(event.order);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void resync();

    void (async () => {
      let attempt = 0;
      while (!signal.aborted) {
        try {
          await openOrderStream({
            signal,
            onOpen: () => {
              attempt = 0;
              setConnection('live');
              void resync();
            },
            onEvent: applyEvent,
          });
        } catch {
          // Cai para o backoff abaixo.
        }
        if (signal.aborted) return;
        setConnection('reconnecting');
        await sleep(reconnectDelay(attempt), signal);
        attempt += 1;
      }
    })();

    return () => controller.abort();
  }, [resync, applyEvent]);

  /**
   * Otimista: o cartão muda de coluna na hora. Falhou → volta ao estado
   * anterior e relança (a página mostra o erro por `code`).
   */
  const transition = useCallback(async (id: number, body: TransitionBody) => {
    const previous = ordersRef.current.find((o) => o.id === id);
    if (!previous) return;
    setOrders((current) => upsert(current, { ...previous, status: body.to }));
    try {
      const { order } = await transitionOrder(id, body);
      setOrders((current) => upsert(current, order));
    } catch (err) {
      setOrders((current) => upsert(current, previous));
      throw err;
    }
  }, []);

  return { orders, loading, loadError, connection, transition, reload: resync };
}
