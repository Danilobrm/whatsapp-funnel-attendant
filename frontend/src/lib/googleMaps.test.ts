import { beforeEach, describe, expect, it, vi } from 'vitest';

const loader = vi.hoisted(() => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn(),
}));
vi.mock('@googlemaps/js-api-loader', () => loader);

import {
  loadGoogleMaps,
  MapsUnavailableError,
  resetGoogleMapsLoader,
} from './googleMaps.ts';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  resetGoogleMapsLoader();
  (globalThis as { google?: unknown }).google = { maps: { tag: 'maps' } };
});

describe('loadGoogleMaps', () => {
  it('without a key rejects with no_key and never touches the loader', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    await expect(loadGoogleMaps()).rejects.toMatchObject({
      name: 'MapsUnavailableError',
      code: 'no_key',
    });
    expect(loader.importLibrary).not.toHaveBeenCalled();
  });

  it('loads once and memoizes the promise', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'browser-key');
    loader.importLibrary.mockResolvedValue({});

    const [a, b] = await Promise.all([loadGoogleMaps(), loadGoogleMaps()]);

    expect(a).toBe(b);
    expect(a).toEqual({ tag: 'maps' });
    expect(loader.setOptions).toHaveBeenCalledTimes(1);
    expect(loader.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'browser-key' }),
    );
  });

  it('a failed load is reported as load_failed and can be retried', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'browser-key');
    loader.importLibrary.mockRejectedValueOnce(new Error('network'));

    const error = await loadGoogleMaps().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MapsUnavailableError);
    expect((error as MapsUnavailableError).code).toBe('load_failed');

    loader.importLibrary.mockResolvedValue({});
    await expect(loadGoogleMaps()).resolves.toEqual({ tag: 'maps' });
  });
});
