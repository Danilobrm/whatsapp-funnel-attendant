import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/simulator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/simulator')>();
  return {
    ...actual,
    fetchSimulatorConversation: vi.fn(),
    sendSimulatorMessage: vi.fn(),
    resetSimulatorConversation: vi.fn(),
  };
});

const api = await import('../../api/simulator');
const { useSimulator } = await import('./useSimulator.ts');

const fetchConversation = vi.mocked(api.fetchSimulatorConversation);
const sendMessage = vi.mocked(api.sendSimulatorMessage);
const resetConversation = vi.mocked(api.resetSimulatorConversation);

beforeEach(() => {
  vi.resetAllMocks();
  fetchConversation.mockResolvedValue([]);
});

async function mountReady() {
  const hook = renderHook(() => useSimulator());
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
