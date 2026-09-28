/**
 * Guarda o idioma da interface no localStorage. SEM IMPORTS de propósito —
 * mesma razão de `api/authToken.ts`: mantém `index.tsx` livre de um módulo
 * que só existe para ler/escrever uma chave.
 */
export const LOCALE_STORAGE_KEY = 'ui_locale';

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function getStoredLocale(): string | null {
  return storage()?.getItem(LOCALE_STORAGE_KEY) ?? null;
}

export function setStoredLocale(locale: string): void {
  storage()?.setItem(LOCALE_STORAGE_KEY, locale);
}
