import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MapsUnavailableError } from '../../../lib/googleMaps.ts';
import { renderWithProviders, screen, waitFor } from '../../../test/render.tsx';

// O Google Maps precisa de rede e layout reais. O fake registra cada polígono
// com as opções e os handlers.
const polygons: {
  opts: Record<string, unknown>;
  handlers: Record<string, (e?: unknown) => void>;
  removed: boolean;
}[] = [];

const boundary = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock('../cityBoundary.ts', () => ({
  MAP_ID: undefined,
  applyCityBoundary: boundary.apply,
}));

const loader = vi.hoisted(() => ({ loadGoogleMaps: vi.fn() }));
vi.mock('../../../lib/googleMaps.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/googleMaps.ts')>()),
  loadGoogleMaps: loader.loadGoogleMaps,
}));

const fakeMaps = {
  Map: vi.fn(() => ({ fitBounds: vi.fn(), setOptions: vi.fn() })),
  Polygon: vi.fn((opts: Record<string, unknown>) => {
    const entry = {
      opts: { ...opts },
      handlers: {} as Record<string, (e?: unknown) => void>,
      removed: false,
    };
    polygons.push(entry);
    return {
      addListener: vi.fn((event: string, fn: (e?: unknown) => void) => {
        entry.handlers[event] = fn;
      }),
      setOptions: vi.fn((o: Record<string, unknown>) => {
        entry.opts = { ...entry.opts, ...o };
      }),
      setMap: vi.fn((m: unknown) => {
        if (m === null) entry.removed = true;
      }),
    };
  }),
};

import DeliveryMap from './DeliveryMap.tsx';

import type { StoreGeo } from '../../../api/store/store.ts';

const SQUARE = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ] as [number, number][][],
};

const GEO: StoreGeo = {
  cityOsmId: 1,
  cityName: 'Luziânia',
  state: 'Goiás',
  cityGeometry: SQUARE,
  neighborhoods: [
    { osmId: 'way/1', name: 'Centro', key: 'centro', geometry: SQUARE },
    {
      osmId: 'way/2',
      name: 'Setor Mandu',
      key: 'setor mandu',
      geometry: SQUARE,
    },
  ],
  fetchedAt: '',
};

const ZONES = new Map([
  ['centro', { id: 1, neighborhood: 'Centro', feeCents: 500, active: true }],
]);

async function drawn() {
  await waitFor(() => expect(polygons.length).toBeGreaterThanOrEqual(4));
  // Deixa o efeito de rótulos/estilo (depende de state=ready) rodar.
  await waitFor(() => expect(fakeMaps.Map).toHaveBeenCalled());
}

beforeEach(() => {
  polygons.length = 0;
  vi.clearAllMocks();
  loader.loadGoogleMaps.mockResolvedValue(fakeMaps);
  boundary.apply.mockResolvedValue(null);
});

describe('DeliveryMap', () => {
  it('draws mask + city outline + one polygon per neighborhood', async () => {
    renderWithProviders(
      <DeliveryMap
        geo={GEO}
        zonesByKey={ZONES}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    await drawn();

    expect(
      screen.getByRole('region', { name: 'Mapa da área de entrega' }),
    ).toBeInTheDocument();
    // máscara, contorno da cidade, 2 bairros
    expect(polygons).toHaveLength(4);
    // a máscara é o mundo + o buraco da cidade
    expect((polygons[0]?.opts.paths as unknown[]).length).toBe(2);
    expect(polygons[0]?.opts.clickable).toBe(false);
  });

  it('click on a neighborhood calls onSelect with it', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <DeliveryMap
        geo={GEO}
        zonesByKey={ZONES}
        selectedKey={null}
        onSelect={onSelect}
      />,
    );
    await drawn();

    polygons[3]?.handlers.click?.();

    expect(onSelect).toHaveBeenCalledWith(GEO.neighborhoods[1]);
  });

  it('hover shows the fee or "sem taxa definida"; selection thickens the outline', async () => {
    const { rerender } = renderWithProviders(
      <DeliveryMap
        geo={GEO}
        zonesByKey={ZONES}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    await drawn();
    await waitFor(() => expect(polygons[3]?.opts.strokeWeight).toBe(1));

    const move = (i: number) =>
      act(() =>
        polygons[i]?.handlers.mousemove?.({
          domEvent: { clientX: 10, clientY: 10 },
        }),
      );
    move(2);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Centro · R$ 5,00',
    );
    move(3);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Setor Mandu · sem taxa definida',
    );
    act(() => polygons[3]?.handlers.mouseout?.());
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    rerender(
      <DeliveryMap
        geo={GEO}
        zonesByKey={ZONES}
        selectedKey="setor mandu"
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => expect(polygons[3]?.opts.strokeWeight).toBe(3));
  });

  it('without an API key shows the notice and draws nothing', async () => {
    loader.loadGoogleMaps.mockRejectedValue(new MapsUnavailableError('no_key'));
    renderWithProviders(
      <DeliveryMap
        geo={GEO}
        zonesByKey={ZONES}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Configure a chave do Google Maps',
    );
    expect(polygons).toHaveLength(0);
  });

  it('with the Google boundary available, skips the OSM mask and outline', async () => {
    const remove = vi.fn();
    boundary.apply.mockResolvedValue({ restyle: vi.fn(), remove });
    const { unmount } = renderWithProviders(
      <DeliveryMap
        geo={GEO}
        zonesByKey={ZONES}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => expect(polygons).toHaveLength(2));
    expect(boundary.apply).toHaveBeenCalledWith(
      fakeMaps,
      expect.anything(),
      { name: 'Luziânia', state: 'Goiás' },
      expect.anything(),
    );

    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
