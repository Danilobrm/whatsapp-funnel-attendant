/**
 * Guarda a sessão no localStorage. SEM IMPORTS de propósito: `client.ts`
 * depende deste módulo, então importar `auth.ts` aqui fecharia um ciclo.
 */
export const AUTH_TOKEN_STORAGE_KEY = 'auth_token';
export const AUTH_USER_STORAGE_KEY = 'auth_user';

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function getAuthToken(): string | null {
  return storage()?.getItem(AUTH_TOKEN_STORAGE_KEY) ?? null;
}

export function setAuthToken(token: string): void {
  storage()?.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function getStoredUserJson(): string | null {
  return storage()?.getItem(AUTH_USER_STORAGE_KEY) ?? null;
}

export function setStoredUserJson(json: string): void {
  storage()?.setItem(AUTH_USER_STORAGE_KEY, json);
}

/** Remove as DUAS chaves. Sessão pela metade é sessão inválida. */
export function clearAuthStorage(): void {
  const store = storage();
  store?.removeItem(AUTH_TOKEN_STORAGE_KEY);
  store?.removeItem(AUTH_USER_STORAGE_KEY);
}
