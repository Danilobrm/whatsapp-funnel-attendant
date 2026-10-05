import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { searchCities, setStoreCity, StoreRejectedError } from './store.ts';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('geo da loja', () => {
  it('searchCities codifica a busca na query string', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ cities: [] }),
    });

    await searchCities('São João');

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /\/api\/store\/geo\/cities\?q=S%C3%A3o%20Jo%C3%A3o$/,
    );
  });

  it('setStoreCity envia o osmId via PUT', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ geo: {} }),
    });

    await setStoreCity(334525);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ osmId: 334525 });
  });

  it('502 do backend vira StoreRejectedError("geo_unavailable")', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ code: 'geo_unavailable' }),
    });

    const error = await setStoreCity(1).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(StoreRejectedError);
    expect((error as StoreRejectedError).code).toBe('geo_unavailable');
  });

  it('422 mantém o code do backend (city_not_found)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ code: 'city_not_found', field: 'osmId' }),
    });

    const error = await setStoreCity(1).catch((e: unknown) => e);

    expect((error as StoreRejectedError).code).toBe('city_not_found');
  });
});
