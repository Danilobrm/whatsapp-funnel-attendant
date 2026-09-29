import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/orders/orders.ts', () => ({
  fetchOrders: vi.fn(),
  transitionOrder: vi.fn(),
}));
vi.mock('../../api/orders/orderStream.ts', () => ({
  openOrderStream: vi.fn(),
}));

import {
  fetchOrders,
  transitionOrder,
  type Order,
} from '../../api/orders/orders.ts';
import { openOrderStream } from '../../api/orders/orderStream.ts';
import { reconnectDelay, useOrdersBoard } from './useOrdersBoard.ts';

const fetchMock = vi.mocked(fetchOrders);
const streamMock = vi.mocked(openOrderStream);
const transitionMock = vi.mocked(transitionOrder);

type StreamArgs = Parameters<typeof openOrderStream>[0];

function order(id: number, overrides: Partial<Order> = {}): Order {
  return {
    id,
    number: id,
    conversationId: null,
    customerName: `Cliente ${id}`,
    customerPhone: null,
    status: 'pending',
    fulfillment: 'pickup',
    address: null,
    neighborhood: null,
    paymentMethod: 'pix',
    changeForCents: null,
    subtotalCents: 1000,
    feeCents: 0,
    totalCents: 1000,
    notes: null,
    rejectReason: null,
    rejectNote: null,
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    readyAt: null,
    completedAt: null,
    updatedAt: new Date().toISOString(),
    items: [],
    ...overrides,
  };
}

/** Stream controlável: abre, e fica pendurado até o teste mandar fechar/falhar. */
function controllableStream() {
  const calls: Array<{ args: StreamArgs; fail: (e: Error) => void }> = [];
  streamMock.mockImplementation(
    (args) =>
      new Promise<void>((_resolve, reject) => {
        calls.push({ args, fail: reject });
        args.onOpen?.();
      }),
  );
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useOrdersBoard', () => {
  it('loads the board and goes live when the stream opens', async () => {
    fetchMock.mockResolvedValue({ orders: [order(1)] });
    controllableStream();

    const { result } = renderHook(() => useOrdersBoard());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orders.map((o) => o.id)).toEqual([1]);
    expect(result.current.connection).toBe('live');
  });

  it('applies order_created (calling onOrderCreated) and order_updated', async () => {
    fetchMock.mockResolvedValue({ orders: [order(1)] });
    const calls = controllableStream();
    const onOrderCreated = vi.fn();

    const { result } = renderHook(() => useOrdersBoard({ onOrderCreated }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() =>
      calls[0]!.args.onEvent({ type: 'order_created', order: order(2) }),
    );
    act(() =>
      calls[0]!.args.onEvent({
        type: 'order_updated',
        order: order(1, { status: 'accepted' }),
      }),
    );

    expect(onOrderCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2 }),
    );
    expect(result.current.orders.find((o) => o.id === 1)?.status).toBe(
      'accepted',
    );
    expect(result.current.orders).toHaveLength(2);
  });

  it('reconnects with backoff after the stream fails and re-fetches the board', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockResolvedValue({ orders: [] });
    const calls = controllableStream();

    const { result } = renderHook(() => useOrdersBoard());
    await waitFor(() => expect(result.current.connection).toBe('live'));
    const fetchesBefore = fetchMock.mock.calls.length;

    await act(async () => calls[0]!.fail(new Error('network')));
    expect(result.current.connection).toBe('reconnecting');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(reconnectDelay(0));
    });

    expect(calls).toHaveLength(2);
    expect(result.current.connection).toBe('live');
    expect(fetchMock.mock.calls.length).toBeGreaterThan(fetchesBefore);
  });

  it('transition is optimistic and rolls back on failure', async () => {
    fetchMock.mockResolvedValue({ orders: [order(1)] });
    controllableStream();
    let rejectTransition: (e: Error) => void = () => {};
    transitionMock.mockImplementation(
      () => new Promise((_res, rej) => (rejectTransition = rej)),
    );

    const { result } = renderHook(() => useOrdersBoard());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.transition(1, { to: 'accepted' });
    });
    expect(result.current.orders[0]?.status).toBe('accepted');

    await act(async () => {
      rejectTransition(new Error('409'));
      await pending.catch(() => {});
    });
    expect(result.current.orders[0]?.status).toBe('pending');
  });

  it('reconnectDelay doubles up to 15s', () => {
    expect([0, 1, 2, 3, 4, 5].map(reconnectDelay)).toEqual([
      1000, 2000, 4000, 8000, 15000, 15000,
    ]);
  });
});
