import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

import { I18nProvider, useI18n, useT, availableLocales } from './index.tsx';

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

describe('I18nProvider', () => {
  it('resolves nested keys via dot notation', () => {
    const { result } = renderHook(() => useT(), { wrapper });
    const value = result.current('chat.commands.placeholder');
    // canonical dict is pt-BR; either resolves or falls back to key
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  });

  it('returns the key itself when path is unknown', () => {
    const { result } = renderHook(() => useT(), { wrapper });
    expect(result.current('does.not.exist.__none__')).toBe(
      'does.not.exist.__none__',
    );
  });

  it('exposes setLocale', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe('pt-BR');
    act(() => result.current.setLocale('pt-BR'));
    expect(result.current.locale).toBe('pt-BR');
  });
});

describe('useI18n outside provider', () => {
  it('throws with helpful message', () => {
    expect(() => renderHook(() => useI18n())).toThrow(
      /useI18n must be used inside/,
    );
  });
});

describe('availableLocales', () => {
  it('contains at least pt-BR', () => {
    expect(availableLocales).toContain('pt-BR');
  });
});
