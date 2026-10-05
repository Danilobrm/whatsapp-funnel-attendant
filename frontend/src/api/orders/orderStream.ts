import { getAuthToken } from '../authToken/authToken.ts';
import {
  API_BASE_URL,
  ApiError,
  notifyUnauthorized,
  UnauthorizedError,
} from '../client/client.ts';
import { createSseParser } from '../../lib/sse.ts';

import type { Order } from './orders.ts';

export type OrderStreamEvent =
  | { type: 'order_created'; order: Order }
  | { type: 'order_updated'; order: Order };

interface OpenOrderStreamOptions {
  onOpen?: () => void;
  onEvent: (event: OrderStreamEvent) => void;
  signal: AbortSignal;
}

/**
 * Assina o stream SSE de pedidos. `fetch` com leitura incremental em vez de
 * `EventSource`: `EventSource` não manda header, e o token na URL iria parar
 * em log de proxy.
 *
 * Resolve quando o servidor fecha o stream; rejeita em erro de rede/HTTP.
 * Reconectar é trabalho de quem chama (`useOrdersBoard`).
 */
export async function openOrderStream({
  onOpen,
  onEvent,
  signal,
}: OpenOrderStreamOptions): Promise<void> {
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/api/orders/stream`, {
    headers,
    signal,
  });

  if (response.status === 401) {
    notifyUnauthorized();
    throw new UnauthorizedError('unauthorized');
  }
  if (!response.ok || !response.body) {
    throw new ApiError(response.status);
  }

  onOpen?.();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      if (event.event !== 'order_created' && event.event !== 'order_updated')
        continue;
      try {
        onEvent({ type: event.event, order: JSON.parse(event.data) as Order });
      } catch {
        // Evento malformado não derruba o stream — o próximo resync corrige.
      }
    }
  }
}
