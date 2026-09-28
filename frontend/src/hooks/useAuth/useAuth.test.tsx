import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/auth')>();
  return { ...actual, login: vi.fn(), fetchCurrentUser: vi.fn() };
});

/**
 * Captura o handler de 401 que o provider registra, para poder dispará-lo
 * como o `request` faria — sem precisar de uma resposta HTTP falsa.
 */
let onUnauthorized: (() => void) | null = null;

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    setUnauthorizedHandler: vi.fn((fn: (() => void) | null) => {
      onUnauthorized = fn;
    }),
  };
});

const api = await import('../../api/auth');
const { AuthError } = api;
const { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } =
  await import('../../api/authToken');
const { setUnauthorizedHandler } = await import('../../api/client');
const { AuthProvider, useAuth } = await import('./useAuth.tsx');

const loginMock = api.login as unknown as ReturnType<typeof vi.fn>;
const fetchCurrentUserMock = api.fetchCurrentUser as unknown as ReturnType<
  typeof vi.fn
>;

const USER = {
  id: 11,
  email: 'danilo@admin.com',
  tenant: { id: 1, slug: 'pizzaria-demo', name: 'Pizzaria Demo' },
};

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function seedSession(user = USER) {
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'jwt');
  window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
}

beforeEach(() => {
  window.localStorage.clear();
  onUnauthorized = null;
  // Reset dirigido: `vi.resetAllMocks()` apagaria a implementação de
  // `setUnauthorizedHandler`, que é justamente quem captura o handler.
  loginMock.mockReset();
  fetchCurrentUserMock.mockReset();
  fetchCurrentUserMock.mockResolvedValue(USER);
});

afterEach(() => {
  setUnauthorizedHandler(null);
});

describe('estado inicial', () => {
  it('começa anônimo com storage vazio', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(fetchCurrentUserMock).not.toHaveBeenCalled();
  });

  it('hidrata de forma síncrona quando token E usuário estão guardados', () => {
    seedSession();

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Síncrono no primeiro render é o que evita o piscar da tela de login
    // a cada F5 em /admin.
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('danilo@admin.com');
  });

  it('trata token sem snapshot de usuário como deslogado', () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'jwt');

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
  });

  it('trata snapshot sem token como deslogado — o token é a autoridade', () => {
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(USER));

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
  });

  it('ignora snapshot corrompido sem quebrar', () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'jwt');
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, '{nao-e-json');

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('revalidação no boot', () => {
  it('atualiza o snapshot com os dados frescos do servidor', async () => {
    seedSession({ ...USER, email: 'antigo@admin.com' });
    fetchCurrentUserMock.mockResolvedValue(USER);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() =>
      expect(result.current.user?.email).toBe('danilo@admin.com'),
    );
    expect(result.current.revalidating).toBe(false);
  });

  it('NÃO desloga em falha de rede — só um 401 real desloga', async () => {
    seedSession();
    fetchCurrentUserMock.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.revalidating).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
  });
});

describe('login', () => {
  it('guarda as duas chaves e expõe usuário + tenant', async () => {
    loginMock.mockResolvedValue({ token: 'jwt-novo', user: USER });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(() => result.current.login('  danilo@admin.com  ', '123456'));

    expect(loginMock).toHaveBeenCalledWith('danilo@admin.com', '123456');
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe(
      'jwt-novo',
    );
    expect(result.current.user?.tenant.slug).toBe('pizzaria-demo');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('propaga AuthError e não guarda nada', async () => {
    loginMock.mockRejectedValue(new AuthError('invalid_credentials'));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await expect(
      act(() => result.current.login('x@y.com', 'errada')),
    ).rejects.toThrow('invalid_credentials');

    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('logout', () => {
  it('limpa as duas chaves', async () => {
    seedSession();
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => result.current.logout());

    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(AUTH_USER_STORAGE_KEY)).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('401 global', () => {
  it('registra um handler no client', () => {
    renderHook(() => useAuth(), { wrapper });

    expect(onUnauthorized).toBeTypeOf('function');
  });

  it('derruba a sessão e marca sessionExpired quando o handler dispara', async () => {
    seedSession();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.revalidating).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);

    act(() => onUnauthorized?.());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.sessionExpired).toBe(true);
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(AUTH_USER_STORAGE_KEY)).toBeNull();
  });

  it('logout limpa o aviso de sessão expirada', async () => {
    seedSession();
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => onUnauthorized?.());
    expect(result.current.sessionExpired).toBe(true);

    act(() => result.current.logout());

    expect(result.current.sessionExpired).toBe(false);
  });

  it('um login novo limpa o aviso de sessão expirada', async () => {
    seedSession();
    loginMock.mockResolvedValue({ token: 'jwt', user: USER });
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => onUnauthorized?.());

    await act(() => result.current.login('danilo@admin.com', '123456'));

    expect(result.current.sessionExpired).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('desregistra o handler ao desmontar', () => {
    const { unmount } = renderHook(() => useAuth(), { wrapper });

    unmount();

    expect(onUnauthorized).toBeNull();
  });
});

describe('fora do provider', () => {
  it('lança mensagem explicativa', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      /useAuth must be used inside/,
    );
  });
});
