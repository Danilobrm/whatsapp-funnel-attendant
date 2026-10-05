import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/simulator/simulator.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/simulator/simulator.ts')>();
  return {
    ...actual,
    fetchSimulatorConversation: vi.fn(),
    fetchSimulatorCart: vi.fn(),
    sendSimulatorMessage: vi.fn(),
    resetSimulatorConversation: vi.fn(),
  };
});

const api = await import('../../api/simulator/simulator.ts');
const { useSimulator } = await import('./useSimulator.ts');

const fetchConversation = vi.mocked(api.fetchSimulatorConversation);
const fetchCart = vi.mocked(api.fetchSimulatorCart);
const sendMessage = vi.mocked(api.sendSimulatorMessage);
const resetConversation = vi.mocked(api.resetSimulatorConversation);

beforeEach(() => {
  vi.resetAllMocks();
  fetchConversation.mockResolvedValue([]);
  fetchCart.mockResolvedValue(null);
});

async function mountReady(contactId: string | null = null) {
  const hook = renderHook(() => useSimulator(contactId));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return hook;
}

describe('useSimulator', () => {
  it('loads the saved test conversation', async () => {
    fetchConversation.mockResolvedValue([
      { direction: 'inbound', body: 'oi', createdAt: 't1' },
      { direction: 'outbound', body: 'Olá!', createdAt: 't2' },
    ]);

    const { result } = await mountReady();

    expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'oi'],
      ['assistant', 'Olá!'],
    ]);
  });

  it('flags a failed load', async () => {
    fetchConversation.mockRejectedValue(new Error('HTTP 500'));

    const { result } = renderHook(() => useSimulator());

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('appends the user message and the replies with their provider', async () => {
    sendMessage.mockResolvedValue({
      replies: ['Qual sabor?'],
      provider: 'agent',
    });
    const { result } = await mountReady();

    await act(() => result.current.send('quero pizza'));

    expect(result.current.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'quero pizza' }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Qual sabor?',
        provider: 'agent',
      }),
    ]);
    expect(result.current.messages.some((m) => m.pending)).toBe(false);
  });

  it('renders a rejection by code, never by message', async () => {
    sendMessage.mockRejectedValue(
      new api.SimulatorRejectedError('text_too_long'),
    );
    const { result } = await mountReady();

    await act(() => result.current.send('x'));

    expect(result.current.messages.at(-1)).toMatchObject({
      contentKey: 'chat.errors.text_too_long',
      error: true,
    });
  });

  it('falls back to the generic error on network failure', async () => {
    sendMessage.mockRejectedValue(new Error('HTTP 500'));
    const { result } = await mountReady();

    await act(() => result.current.send('x'));

    expect(result.current.messages.at(-1)).toMatchObject({
      contentKey: 'chat.error',
      error: true,
    });
  });

  it('handles /reiniciar locally without sending it to the attendant', async () => {
    resetConversation.mockResolvedValue(undefined);
    fetchConversation.mockResolvedValue([
      { direction: 'inbound', body: 'oi', createdAt: 't1' },
    ]);
    const { result } = await mountReady();

    await act(() => result.current.send('/reiniciar'));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(resetConversation).toHaveBeenCalledTimes(1);
    expect(result.current.messages).toEqual([
      expect.objectContaining({ contentKey: 'simulator.resetDone' }),
    ]);
  });
});

const CART = {
  status: 'awaiting_confirmation' as const,
  lines: [],
  subtotalCents: 0,
  feeCents: 0,
  totalCents: 0,
  fulfillment: null,
  address: null,
  payment: null,
  changeFor: null,
  notes: null,
  pending: [],
};

describe('useSimulator — depuração', () => {
  it('loads the current cart along with the conversation', async () => {
    fetchCart.mockResolvedValue(CART);

    const { result } = await mountReady();

    await waitFor(() => expect(result.current.debug.cart).toEqual(CART));
    expect(result.current.debug.toolCalls).toEqual([]);
  });

  // O carrinho é depuração: falhar em buscá-lo não pode derrubar a conversa.
  it('keeps the conversation usable when the cart fails to load', async () => {
    fetchCart.mockRejectedValue(new Error('HTTP 500'));

    const { result } = await mountReady();

    expect(result.current.status).toBe('ready');
    expect(result.current.debug.cart).toBeNull();
  });

  it('keeps the cart and the tool calls of the last turn', async () => {
    const toolCalls = [
      { name: 'add_item', args: { item_id: 10 }, result: { ok: true } },
    ];
    sendMessage.mockResolvedValue({
      replies: ['Anotei!'],
      provider: 'agent',
      debug: { toolCalls, cart: CART },
    });
    const { result } = await mountReady();

    await act(() => result.current.send('uma pizza'));

    expect(result.current.debug).toEqual({ cart: CART, toolCalls });
  });

  it('replaces the previous turn tool calls with the new turn', async () => {
    sendMessage
      .mockResolvedValueOnce({
        replies: ['a'],
        provider: 'agent',
        debug: {
          toolCalls: [{ name: 'view_cart', args: {}, result: { ok: true } }],
          cart: null,
        },
      })
      .mockResolvedValueOnce({
        replies: ['b'],
        provider: 'persona',
        debug: { toolCalls: [], cart: null },
      });
    const { result } = await mountReady();

    await act(() => result.current.send('1'));
    expect(result.current.debug.toolCalls).toHaveLength(1);
    await act(() => result.current.send('2'));

    expect(result.current.debug.toolCalls).toEqual([]);
  });

  it('clears the debug state on /reiniciar', async () => {
    fetchCart.mockResolvedValue(CART);
    resetConversation.mockResolvedValue(undefined);
    const { result } = await mountReady();
    await waitFor(() => expect(result.current.debug.cart).toEqual(CART));

    await act(() => result.current.send('/reiniciar'));

    expect(result.current.debug).toEqual({ cart: null, toolCalls: [] });
  });
});

describe('useSimulator — cliente de teste', () => {
  it('sends, reads and resets against the chosen customer', async () => {
    sendMessage.mockResolvedValue({ replies: ['ok'], provider: 'agent' });
    resetConversation.mockResolvedValue(undefined);
    const { result } = await mountReady('5561990000001');

    expect(fetchConversation).toHaveBeenCalledWith('5561990000001');
    expect(fetchCart).toHaveBeenCalledWith('5561990000001');

    await act(() => result.current.send('oi'));
    expect(sendMessage).toHaveBeenCalledWith('oi', '5561990000001');

    await act(() => result.current.send('/reiniciar'));
    expect(resetConversation).toHaveBeenCalledWith('5561990000001');
  });

  it('reloads the conversation and clears the debug when the customer changes', async () => {
    fetchConversation.mockImplementation(async (contactId) =>
      contactId === '5561990000002'
        ? [{ direction: 'inbound', body: 'sou o Bruno', createdAt: 't' }]
        : [{ direction: 'inbound', body: 'sou a Ana', createdAt: 't' }],
    );
    fetchCart.mockResolvedValue(CART);
    const hook = renderHook(
      ({ contactId }: { contactId: string | null }) => useSimulator(contactId),
      { initialProps: { contactId: '5561990000001' as string | null } },
    );
    await waitFor(() =>
      expect(hook.result.current.messages[0]?.content).toBe('sou a Ana'),
    );
    await waitFor(() => expect(hook.result.current.debug.cart).toEqual(CART));

    fetchCart.mockResolvedValue(null);
    hook.rerender({ contactId: '5561990000002' });

    await waitFor(() =>
      expect(hook.result.current.messages[0]?.content).toBe('sou o Bruno'),
    );
    await waitFor(() => expect(hook.result.current.debug.cart).toBeNull());
    expect(hook.result.current.status).toBe('ready');
  });

  // A resposta lenta do cliente A não pode aparecer na conversa do cliente B.
  it('drops a reply that arrives after switching to another customer', async () => {
    let resolveSend: (value: {
      replies: string[];
      provider: 'agent';
    }) => void = () => undefined;
    sendMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );
    fetchConversation.mockResolvedValue([]);
    const hook = renderHook(
      ({ contactId }: { contactId: string | null }) => useSimulator(contactId),
      { initialProps: { contactId: '5561990000001' as string | null } },
    );
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));

    let sending: Promise<void> = Promise.resolve();
    act(() => {
      sending = hook.result.current.send('oi');
    });
    hook.rerender({ contactId: '5561990000002' });
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    await act(async () => {
      resolveSend({ replies: ['resposta da Ana'], provider: 'agent' });
      await sending;
    });

    expect(
      hook.result.current.messages.some((m) => m.content === 'resposta da Ana'),
    ).toBe(false);
  });
});

describe('useSimulator — voltou para a aba', () => {
  function becomeVisible() {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  // O carrinho montado na página do cardápio chega como mensagem NA conversa.
  it('shows messages that arrived while the tab was away (e.g. "Recebi seu carrinho")', async () => {
    fetchConversation.mockResolvedValue([
      {
        direction: 'outbound',
        body: 'Aqui está o cardápio: https://x.app/c/t',
        createdAt: 't1',
      },
    ]);
    const { result } = await mountReady();

    fetchConversation.mockResolvedValue([
      {
        direction: 'outbound',
        body: 'Aqui está o cardápio: https://x.app/c/t',
        createdAt: 't1',
      },
      {
        direction: 'outbound',
        body: 'Recebi seu carrinho pelo cardápio!',
        createdAt: 't2',
      },
    ]);
    fetchCart.mockResolvedValue(CART);
    becomeVisible();

    await waitFor(() =>
      expect(result.current.messages.map((m) => m.content)).toEqual([
        'Aqui está o cardápio: https://x.app/c/t',
        'Recebi seu carrinho pelo cardápio!',
      ]),
    );
    await waitFor(() => expect(result.current.debug.cart).toEqual(CART));
  });

  it('keeps the list (and local notices) when nothing new arrived', async () => {
    resetConversation.mockResolvedValue(undefined);
    fetchConversation.mockResolvedValue([]);
    const { result } = await mountReady();
    await act(() => result.current.send('/reiniciar'));
    const before = result.current.messages;
    fetchConversation.mockClear();

    becomeVisible();

    await waitFor(() => expect(fetchConversation).toHaveBeenCalled());
    expect(result.current.messages).toBe(before);
  });

  it('does not double the messages of a turn it already shows', async () => {
    sendMessage.mockResolvedValue({ replies: ['Oi!'], provider: 'agent' });
    const { result } = await mountReady();
    await act(() => result.current.send('oi'));
    const before = result.current.messages;

    // O servidor tem as mesmas 2 mensagens (cliente + resposta).
    fetchConversation.mockResolvedValue([
      { direction: 'inbound', body: 'oi', createdAt: 't1' },
      { direction: 'outbound', body: 'Oi!', createdAt: 't2' },
    ]);
    becomeVisible();

    await waitFor(() => expect(fetchConversation).toHaveBeenCalledTimes(2));
    expect(result.current.messages).toBe(before);
  });

  it('does nothing while the tab is hidden', async () => {
    await mountReady();
    fetchConversation.mockClear();

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(fetchConversation).not.toHaveBeenCalled();
  });

  it('ignores a refresh failure (it is a convenience, the chat keeps working)', async () => {
    fetchConversation.mockResolvedValue([
      { direction: 'inbound', body: 'oi', createdAt: 't1' },
    ]);
    const { result } = await mountReady();
    fetchConversation.mockRejectedValue(new Error('HTTP 500'));
    fetchCart.mockRejectedValue(new Error('HTTP 500'));

    becomeVisible();

    await waitFor(() => expect(fetchConversation).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('ready');
    expect(result.current.messages).toHaveLength(1);
  });

  it('stops listening after unmount', async () => {
    const { unmount } = await mountReady();
    unmount();
    fetchConversation.mockClear();

    becomeVisible();

    expect(fetchConversation).not.toHaveBeenCalled();
  });
});
