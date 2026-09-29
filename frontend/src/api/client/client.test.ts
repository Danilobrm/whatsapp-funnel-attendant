import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_TOKEN_STORAGE_KEY } from '../authToken';
import {
  ApiError,
  API_BASE_URL,
  UnauthorizedError,
  request,
  setUnauthorizedHandler,
} from './client.ts';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

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

describe('base url', () => {
  it('falls back to localhost:3000 when VITE_API_BASE_URL is unset', () => {
    expect(API_BASE_URL).toBe('http://localhost:3000');
  });
});

describe('Authorization header', () => {
  it('attaches the bearer when a token is stored', async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-123');
    fetchMock.mockResolvedValue(jsonResponse(200));

    await request('/api/settings');

    expect(init().headers.Authorization).toBe('Bearer tok-123');
  });

  it('omits it when there is no token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200));

    await request('/api/settings');

    expect(init().headers.Authorization).toBeUndefined();
  });

  it('omits it when auth is explicitly false', async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-123');
    fetchMock.mockResolvedValue(jsonResponse(200));

    await request('/api/public/tenants', { auth: false });

    expect(init().headers.Authorization).toBeUndefined();
  });

  it('reads storage per request, so a fresh login is picked up immediately', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200));

    await request('/a');
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'novo');
    await request('/b');

    const second = fetchMock.mock.calls[1]?.[1] as {
      headers: Record<string, string>;
    };
    expect(second.headers.Authorization).toBe('Bearer novo');
  });
});

describe('body and content-type', () => {
  it('sets Content-Type only when there is a body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200));

    await request('/x');
    expect(init().headers['Content-Type']).toBeUndefined();
    expect(init().body).toBeUndefined();

    fetchMock.mockClear();
    await request('/x', { method: 'POST', body: { a: 1 } });
    expect(init().headers['Content-Type']).toBe('application/json');
    expect(init().body).toBe(JSON.stringify({ a: 1 }));
  });

  it('sends FormData as-is, without Content-Type (o browser escreve o boundary)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200));
    const form = new FormData();
    form.append('image', new Blob(['x']), 'foto.png');

    await request('/x', { method: 'POST', body: form });

    expect(init().headers['Content-Type']).toBeUndefined();
    expect(init().body).toBe(form);
  });
});

describe('erros', () => {
  it('throws ApiError with the load-bearing "HTTP <status>" message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500));

    // A mensagem não é UI — mas os testes de api/* se apoiam nela.
    await expect(request('/x')).rejects.toThrow('HTTP 500');
    await expect(request('/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('maps 401 to UnauthorizedError carrying the backend code', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { code: 'expired_token' }));

    const error = await request('/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as UnauthorizedError).code).toBe('expired_token');
  });

  it('fires the global handler on an unhandled 401', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(jsonResponse(401, { code: 'expired_token' }));

    await request('/x').catch(() => undefined);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire the global handler when 401 is mapped in onStatus', async () => {
    // É esta regra que impede uma senha errada de virar logout + redirect.
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(jsonResponse(401, { code: 'invalid_creds' }));

    const error = await request('/login', {
      onStatus: { 401: () => new Error('mapeado') },
    }).catch((e: unknown) => e);

    expect((error as Error).message).toBe('mapeado');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('lets onStatus win over the generic !ok branch', async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { code: 'answer_too_long' }));

    const error = await request('/x', {
      onStatus: {
        422: (payload) =>
          new Error(`rejeitado:${(payload as { code: string }).code}`),
      },
    }).catch((e: unknown) => e);

    expect((error as Error).message).toBe('rejeitado:answer_too_long');
  });

  it('resolves a 204 without reading a body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('no body');
      },
    });

    await expect(request('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('survives a non-JSON error body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => {
        throw new Error('not json');
      },
    });

    const error = await request('/x').catch((e: unknown) => e);

    expect((error as UnauthorizedError).code).toBe('unauthorized');
  });
});
