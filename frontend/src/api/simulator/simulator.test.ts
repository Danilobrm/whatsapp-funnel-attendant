import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SimulatorRejectedError,
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
