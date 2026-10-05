import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAuthStorage, setAuthToken } from '../authToken/authToken.ts';
import { setUnauthorizedHandler } from '../client/client.ts';
import {
  PublicMenuError,
  confirmPublicCart,
  fetchPublicMenu,
} from './publicMenu.ts';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  setUnauthorizedHandler(null);
  clearAuthStorage();
});

describe('fetchPublicMenu', () => {
  it('GETs the token URL (encoded) and returns the view', async () => {
    const view = { restaurant: { name: 'Zé' }, menu: [], cart: { items: [] } };
    fetchMock.mockResolvedValue(jsonResponse(200, view));

    await expect(fetchPublicMenu('a.b/c')).resolves.toEqual(view);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3000/api/public/menu/a.b%2Fc',
    );
  });

  // Quem abre o link é o cliente: nunca manda a credencial do painel.
  it('never sends the admin Authorization header', async () => {
    setAuthToken('admin-token');
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await fetchPublicMenu('tok');

    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('maps a 401 to a typed error carrying the code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { code: 'expired_menu_link' }),
    );

    const error = await fetchPublicMenu('tok').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PublicMenuError);
    expect(error).toMatchObject({ status: 401, code: 'expired_menu_link' });
  });

  // Link vencido do cliente não pode deslogar o admin que usa o mesmo navegador.
  it('a 401 does NOT trigger the global sign-out', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(
      jsonResponse(401, { code: 'invalid_menu_link' }),
    );

    await fetchPublicMenu('tok').catch(() => undefined);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('maps a 429 and falls back to code "unknown" for a body without code', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { code: 'rate_limited' }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(401, null));

    expect(await fetchPublicMenu('t').catch((e: unknown) => e)).toMatchObject({
      status: 429,
      code: 'rate_limited',
    });
    expect(await fetchPublicMenu('t').catch((e: unknown) => e)).toMatchObject({
      status: 401,
      code: 'unknown',
    });
  });

  it('a 500 stays a plain ApiError (no code to translate)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500));

    await expect(fetchPublicMenu('tok')).rejects.toThrow('HTTP 500');
  });
});

describe('confirmPublicCart', () => {
  const ITEMS = [
    {
      itemId: 10,
      sizeId: 102,
      optionIds: [2001, 2003],
      quantity: 1,
      notes: null,
    },
  ];

  it('POSTs only the ids and quantities (no prices) and returns the confirmed cart', async () => {
    const cart = {
      lines: [],
      subtotalCents: 0,
      notified: true,
      whatsappUrl: null,
    };
    fetchMock.mockResolvedValue(jsonResponse(200, { cart }));

    await expect(confirmPublicCart('tok', ITEMS)).resolves.toEqual(cart);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/public/cart/tok');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ items: ITEMS }));
    expect(String(init.body)).not.toMatch(/price/i);
  });

  it('maps a 422 with the per-line problems', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        code: 'cart_invalid',
        problems: [{ code: 'item_unavailable', lineIndex: 1 }],
      }),
    );

    const error = await confirmPublicCart('tok', ITEMS).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(PublicMenuError);
    expect(error).toMatchObject({
      status: 422,
      code: 'cart_invalid',
      problems: [{ code: 'item_unavailable', lineIndex: 1 }],
    });
  });

  it('a 422 without problems has an empty list (cart_empty)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { code: 'cart_empty' }));

    expect(
      await confirmPublicCart('tok', []).catch((e: unknown) => e),
    ).toMatchObject({
      code: 'cart_empty',
      problems: [],
    });
  });
});
