import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import ptBR from './translations/pt-BR.ts';
import enUS from './translations/en-US.ts';
import { getStoredLocale, setStoredLocale } from './localePreference.ts';

export type Locale = 'pt-BR' | 'en-US';

// Add new locales here as they become available.
const dictionaries: Record<Locale, unknown> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};

export const availableLocales: readonly Locale[] = ['pt-BR', 'en-US'] as const;

function isLocale(value: string | null): value is Locale {
  return (availableLocales as readonly string[]).includes(value ?? '');
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function lookup(dict: unknown, path: string): string | undefined {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (
      acc &&
      typeof acc === 'object' &&
      key in (acc as Record<string, unknown>)
    ) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, dict);

  return typeof value === 'string' ? value : undefined;
}

interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  // `initialLocale` é só pra teste forçar um idioma; em produção ninguém
  // passa essa prop, então o idioma vem do que foi salvo da última visita.
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (initialLocale) return initialLocale;
    const stored = getStoredLocale();
    return isLocale(stored) ? stored : 'pt-BR';
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    setStoredLocale(l);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string) => lookup(dictionaries[locale], key) ?? key,
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return ctx;
}

export function useT(): (key: string) => string {
  return useI18n().t;
}
