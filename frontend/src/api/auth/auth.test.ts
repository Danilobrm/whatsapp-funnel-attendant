import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError, fetchCurrentUser, login } from './auth.ts';
import { AUTH_TOKEN_STORAGE_KEY } from '../authToken';
import { setUnauthorizedHandler } from '../client';

const fetchMock = vi.fn();

const USER = {
  id: 11,
  email: 'danilo@admin.com',
  tenant: { id: 1, slug: 'pizzaria-demo', name: 'Pizzaria Demo' },
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  setUnauthorizedHandler(null);
});

function init() {
  return fetchMock.mock.calls[0]?.[1] as RequestInit & {
    headers: Record<string, string>;
  };
}

describe('login', () => {
  it('POSTs the credentials and returns token + user', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'jwt', user: USER }),
    });

    await expect(login('danilo@admin.com', '123456')).resolves.toEqual({
      token: 'jwt',
      user: USER,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3000/api/auth/login',
    );
    expect(init().body).toBe(
      JSON.stringify({ email: 'danilo@admin.com', password: '123456' }),
    );
  });

  it('never sends a stale bearer with the login request', async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'velho');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'jwt', user: USER }),
    });

    await login('danilo@admin.com', '123456');

    expect(init().headers.Authorization).toBeUndefined();
  });

  it('maps 401 to AuthError with the backend code', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'invalid_credentials' }),
    });

    const error = await login('x@y.com', 'z').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).code).toBe('invalid_credentials');
    // message === code para a página resolver login.errors.<code>.
    expect((error as AuthError).message).toBe('invalid_credentials');
  });

  it('does not trigger the global sign-out on a failed login', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'invalid_credentials' }),
    });

    await login('x@y.com', 'z').catch(() => undefined);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('maps 429 to rate_limited', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    await expect(login('x@y.com', 'z')).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });
});

describe('fetchCurrentUser', () => {
  it('GETs /api/auth/me with the bearer and unwraps user', async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'jwt');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: USER }),
    });

    await expect(fetchCurrentUser()).resolves.toEqual(USER);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3000/api/auth/me',
    );
    expect(init().headers.Authorization).toBe('Bearer jwt');
  });

  it('lets a 401 reach the global handler — a dead session must sign out', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'expired_token' }),
    });

    await fetchCurrentUser().catch(() => undefined);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
