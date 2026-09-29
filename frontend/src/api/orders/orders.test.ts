import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setUnauthorizedHandler } from '../client/client.ts';
import { openOrderStream } from './orderStream.ts';
import {
  createSampleOrder,
  OrderRejectedError,
  transitionOrder,
} from './orders.ts';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  setUnauthorizedHandler(null);
});

function streamResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: encoder.encode(chunks[i++]) }
            : { done: true, value: undefined },
      }),
    },
  };
}

describe('orders api', () => {
  it('transitionOrder posts the body to /:id/transition', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ order: {} }),
    });

    await transitionOrder(7, { to: 'rejected', reason: 'sold_out' });

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /\/api\/orders\/7\/transition$/,
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      to: 'rejected',
      reason: 'sold_out',
    });
  });

  it.each([404, 409, 422])(
    '%s becomes OrderRejectedError with the code',
    async (status) => {
      fetchMock.mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ code: 'invalid_transition' }),
      });

      const error = await transitionOrder(1, { to: 'accepted' }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(OrderRejectedError);
      expect((error as OrderRejectedError).code).toBe('invalid_transition');
    },
  );

  it('createSampleOrder posts to /dev-sample', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ order: {} }),
    });
    await createSampleOrder();
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /\/api\/orders\/dev-sample$/,
    );
  });
});

describe('openOrderStream', () => {
  it('emits parsed order events and resolves when the stream ends', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        ': connected\n\nevent: order_cre',
        'ated\ndata: {"id":3}\n\n',
      ]),
    );
    const onEvent = vi.fn();
    const onOpen = vi.fn();

    await openOrderStream({
      onEvent,
      onOpen,
      signal: new AbortController().signal,
    });

    expect(onOpen).toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith({
      type: 'order_created',
      order: { id: 3 },
    });
  });

  it('401 fires the global sign-out and rejects', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(streamResponse([], 401));

    await expect(
      openOrderStream({
        onEvent: vi.fn(),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('non-2xx rejects without opening', async () => {
    fetchMock.mockResolvedValue(streamResponse([], 500));
    const onOpen = vi.fn();

    await expect(
      openOrderStream({
        onEvent: vi.fn(),
        onOpen,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('HTTP 500');
    expect(onOpen).not.toHaveBeenCalled();
  });
});
