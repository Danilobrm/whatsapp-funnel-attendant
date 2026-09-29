import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNewOrderAlert } from './useNewOrderAlert.ts';

beforeEach(() => {
  vi.useFakeTimers();
  document.title = 'Attendant';
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useNewOrderAlert', () => {
  it('flashes the tab title while the page is not focused, and stops on focus', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const { result } = renderHook(() =>
      useNewOrderAlert((n) => `(${n}) Novo pedido`),
    );

    act(() => result.current.notify());
    act(() => vi.advanceTimersByTime(1000));
    expect(document.title).toBe('(1) Novo pedido');

    act(() => window.dispatchEvent(new Event('focus')));
    expect(document.title).toBe('Attendant');
  });

  it('does not flash when the owner is already looking at the page', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { result } = renderHook(() =>
      useNewOrderAlert((n) => `(${n}) Novo pedido`),
    );

    act(() => result.current.notify());
    act(() => vi.advanceTimersByTime(3000));
    expect(document.title).toBe('Attendant');
  });

  it('enableSound unlocks audio and notify beeps', () => {
    const start = vi.fn();
    const oscillator = {
      frequency: { value: 0 },
      connect: vi.fn(() => ({ connect: vi.fn() })),
      start,
      stop: vi.fn(),
    };
    const ctx = {
      currentTime: 0,
      destination: {},
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      })),
    };
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ctx),
    );
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);

    const { result } = renderHook(() => useNewOrderAlert(() => ''));
    expect(result.current.soundEnabled).toBe(false);

    act(() => result.current.enableSound());
    expect(result.current.soundEnabled).toBe(true);

    act(() => result.current.notify());
    expect(start).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
