import { afterEach, describe, expect, it, vi } from 'vitest';

const palette = { accent: 'A', danger: 'D', canvas: 'C' };

function fakeMaps(results: unknown[] | Error, available = true) {
  const layer: { isAvailable: boolean; style: unknown } = {
    isAvailable: available,
    style: null,
  };
  const maps = {
    FeatureType: { LOCALITY: 'LOCALITY' },
    Geocoder: vi.fn(() => ({
      geocode: vi.fn(async () => {
        if (results instanceof Error) throw results;
        return { results };
      }),
    })),
  };
  const map = { getFeatureLayer: vi.fn(() => layer) };
  return { maps, map, layer };
}

async function load(mapId: string) {
  vi.resetModules();
  vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', mapId);
  return import('./cityBoundary.ts');
}

afterEach(() => vi.unstubAllEnvs());

describe('applyCityBoundary', () => {
  it('without a Map ID returns null and never geocodes', async () => {
    const { applyCityBoundary } = await load('');
    const { maps, map } = fakeMaps([]);
    await expect(
      applyCityBoundary(
        maps as never,
        map as never,
        { name: 'X', state: null },
        palette,
      ),
    ).resolves.toBeNull();
    expect(maps.Geocoder).not.toHaveBeenCalled();
  });

  it('returns null when the boundary layer is not enabled for the Map ID', async () => {
    const { applyCityBoundary } = await load('MAP');
    const { maps, map } = fakeMaps([], false);
    await expect(
      applyCityBoundary(
        maps as never,
        map as never,
        { name: 'X', state: null },
        palette,
      ),
    ).resolves.toBeNull();
  });

  it('returns null when the city has no locality result or the geocoder fails', async () => {
    const { applyCityBoundary } = await load('MAP');
    for (const results of [
      [{ types: ['route'], place_id: 'r' }],
      new Error('denied'),
    ]) {
      const { maps, map } = fakeMaps(results);
      await expect(
        applyCityBoundary(
          maps as never,
          map as never,
          { name: 'X', state: 'GO' },
          palette,
        ),
      ).resolves.toBeNull();
    }
  });

  it('styles only the geocoded locality, restyles and removes', async () => {
    const { applyCityBoundary } = await load('MAP');
    const { maps, map, layer } = fakeMaps([
      { types: ['locality'], place_id: 'CITY' },
    ]);
    const boundary = await applyCityBoundary(
      maps as never,
      map as never,
      { name: 'Luziânia', state: 'Goiás' },
      palette,
    );
    expect(boundary).not.toBeNull();

    const style = layer.style as (o: {
      feature: { placeId: string };
    }) => unknown;
    expect(style({ feature: { placeId: 'CITY' } })).toMatchObject({
      strokeColor: 'D',
    });
    expect(style({ feature: { placeId: 'OTHER' } })).toBeNull();

    boundary?.restyle({ ...palette, danger: 'D2' });
    expect(
      (layer.style as typeof style)({ feature: { placeId: 'CITY' } }),
    ).toMatchObject({ strokeColor: 'D2' });

    boundary?.remove();
    expect(layer.style).toBeNull();
  });
});
