import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SimulatorRejectedError,
  createSimulatedCustomer,
  fetchSimulatedCustomers,
  fetchSimulatorCart,
  fetchSimulatorConversation,
  resetSimulatorConversation,
  sendSimulatorMessage,
} from './simulator.ts';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('fetchSimulatorConversation', () => {
  it('returns the history items', async () => {
    const items = [{ direction: 'inbound', body: 'oi', createdAt: 't' }];
    fetchMock.mockResolvedValue(jsonResponse(200, { items }));

    await expect(fetchSimulatorConversation()).resolves.toEqual(items);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3000/api/simulator/conversation',
    );
  });
});

describe('sendSimulatorMessage', () => {
  it('posts the text and returns the replies', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { replies: ['Oi!'], provider: 'persona' }),
    );

    await expect(sendSimulatorMessage('oi')).resolves.toEqual({
      replies: ['Oi!'],
      provider: 'persona',
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ text: 'oi' }));
  });

  it('maps a 422 to a typed error carrying the code', async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { code: 'text_required' }));

    const error = await sendSimulatorMessage(' ').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SimulatorRejectedError);
    expect((error as SimulatorRejectedError).code).toBe('text_required');
  });
});

describe('resetSimulatorConversation', () => {
  it('sends a DELETE and resolves on 204', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null,
    });

    await expect(resetSimulatorConversation()).resolves.toBeUndefined();
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE');
  });
});

describe('conversas de clientes de teste (contactId)', () => {
  it('the default conversation sends no contactId', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { items: [] }));

    await fetchSimulatorConversation();
    await fetchSimulatorConversation(null);

    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe('http://localhost:3000/api/simulator/conversation');
    }
  });

  it('a simulated customer goes in the query string of reads and resets', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { items: [], cart: null }));

    await fetchSimulatorConversation('5561990000001');
    await fetchSimulatorCart('5561990000001');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null,
    });
    await resetSimulatorConversation('5561990000001');

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'http://localhost:3000/api/simulator/conversation?contactId=5561990000001',
      'http://localhost:3000/api/simulator/cart?contactId=5561990000001',
      'http://localhost:3000/api/simulator/conversation?contactId=5561990000001',
    ]);
  });

  it('a simulated customer goes in the body of a message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { replies: [], provider: 'agent' }),
    );

    await sendSimulatorMessage('oi', '5561990000001');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(
      JSON.stringify({ text: 'oi', contactId: '5561990000001' }),
    );
  });

  it('returns the debug block (tool calls + cart) when the backend sends it', async () => {
    const debug = {
      toolCalls: [{ name: 'view_cart', args: {}, result: { ok: true } }],
      cart: null,
    };
    fetchMock.mockResolvedValue(
      jsonResponse(200, { replies: ['ok'], provider: 'agent', debug }),
    );

    await expect(sendSimulatorMessage('oi')).resolves.toMatchObject({ debug });
  });
});

describe('fetchSimulatorCart', () => {
  it('returns the cart, or null when there is none', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { cart: null }));

    await expect(fetchSimulatorCart()).resolves.toBeNull();
  });
});

describe('clientes de teste', () => {
  it('lists them', async () => {
    const items = [
      { contactId: '5561990000001', name: 'Ana', phone: '5561990000001' },
    ];
    fetchMock.mockResolvedValue(jsonResponse(200, { items }));

    await expect(fetchSimulatedCustomers()).resolves.toEqual(items);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3000/api/simulator/customers',
    );
  });

  it('creates one with a POST', async () => {
    const customer = {
      contactId: '5561990000001',
      name: 'Ana',
      phone: '5561990000001',
    };
    fetchMock.mockResolvedValue(jsonResponse(201, { customer }));

    await expect(
      createSimulatedCustomer({ name: 'Ana', phone: '5561990000001' }),
    ).resolves.toEqual(customer);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(
      JSON.stringify({ name: 'Ana', phone: '5561990000001' }),
    );
  });

  it('maps a 422 to a typed error carrying the code', async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { code: 'phone_invalid' }));

    const error = await createSimulatedCustomer({
      name: 'Ana',
      phone: '1',
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SimulatorRejectedError);
    expect((error as SimulatorRejectedError).code).toBe('phone_invalid');
  });
});
