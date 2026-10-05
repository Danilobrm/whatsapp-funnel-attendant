import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MapsUnavailableError } from '../../../lib/googleMaps.ts';
import { renderWithProviders, screen, waitFor } from '../../../test/render.tsx';

// O Google Maps precisa de rede e layout reais. O fake guarda o handler de
// clique do mapa e os marcadores criados.
type Point = { lat: number; lng: number };
const state: {
  mapClick:
    ((e: { latLng: { lat: () => number; lng: () => number } }) => void) | null;
  markers: {
    position: Point;
    removed: boolean;
    dragend: (() => void) | null;
    current: Point;
  }[];
  view: Record<string, unknown>;
} = { mapClick: null, markers: [], view: {} };

const loader = vi.hoisted(() => ({ loadGoogleMaps: vi.fn() }));
vi.mock('../../../lib/googleMaps.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/googleMaps.ts')>()),
  loadGoogleMaps: loader.loadGoogleMaps,
}));

const fakeMaps = {
  Map: vi.fn(() => ({
    setCenter: vi.fn((c: Point) => {
      state.view.center = c;
    }),
    setZoom: vi.fn((z: number) => {
      state.view.zoom = z;
    }),
    fitBounds: vi.fn((bounds: unknown) => {
      state.view.bounds = bounds;
    }),
    setOptions: vi.fn(),
    addListener: vi.fn((event: string, fn: typeof state.mapClick) => {
      if (event === 'click') state.mapClick = fn;
    }),
    getBounds: vi.fn(() => ({ contains: () => true })),
    getZoom: vi.fn(() => 16),
  })),
  Marker: vi.fn((opts: { position: Point }) => {
    const entry = {
      position: opts.position,
      removed: false,
      dragend: null as (() => void) | null,
      current: opts.position,
    };
    state.markers.push(entry);
    return {
      addListener: vi.fn((event: string, fn: () => void) => {
        if (event === 'dragend') entry.dragend = fn;
      }),
      setPosition: vi.fn((next: Point) => {
        entry.position = next;
      }),
      getPosition: vi.fn(() => ({
        lat: () => entry.current.lat,
        lng: () => entry.current.lng,
      })),
      setIcon: vi.fn(),
      setMap: vi.fn((m: unknown) => {
        if (m === null) entry.removed = true;
      }),
    };
  }),
};

import LocationMap from './LocationMap.tsx';

const click = (lat: number, lng: number) => ({
  latLng: { lat: () => lat, lng: () => lng },
});

async function ready() {
  await waitFor(() => expect(fakeMaps.Map).toHaveBeenCalled());
}

beforeEach(() => {
  state.mapClick = null;
  state.markers = [];
  state.view = {};
  vi.clearAllMocks();
  loader.loadGoogleMaps.mockResolvedValue(fakeMaps);
});

describe('LocationMap', () => {
  it('without a pin, frames the city and has no marker', async () => {
    const city: [[number, number], [number, number]] = [
      [-16.3, -48],
      [-16.1, -47.8],
    ];
    renderWithProviders(
      <LocationMap position={null} cityBounds={city} onChange={vi.fn()} />,
    );
    await ready();

    expect(
      screen.getByRole('region', {
        name: 'Mapa da localização do restaurante',
      }),
    ).toBeInTheDocument();
    expect(state.view.bounds).toEqual({
      south: -16.3,
      west: -48,
      north: -16.1,
      east: -47.8,
    });
    expect(state.markers).toHaveLength(0);
  });

  it('with a pin, centers on it at street zoom and draws the marker', async () => {
    renderWithProviders(
      <LocationMap
        position={{ lat: -16.25, lng: -47.95 }}
        cityBounds={null}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(state.markers).toHaveLength(1));

    expect(state.view.center).toEqual({ lat: -16.25, lng: -47.95 });
    expect(state.view.zoom).toBe(16);
    expect(state.markers[0]?.position).toEqual({ lat: -16.25, lng: -47.95 });
  });

  it('map click reports the rounded point; disabled ignores it', async () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(
      <LocationMap position={null} cityBounds={null} onChange={onChange} />,
    );
    await ready();

    state.mapClick?.(click(-16.123456789, -47.1));
    expect(onChange).toHaveBeenCalledWith({ lat: -16.123457, lng: -47.1 });

    rerender(
      <LocationMap
        position={null}
        cityBounds={null}
        onChange={onChange}
        disabled
      />,
    );
    state.mapClick?.(click(1, 1));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('dragging the marker reports the new point; clearing the position removes it', async () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(
      <LocationMap
        position={{ lat: -16.25, lng: -47.95 }}
        cityBounds={null}
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(state.markers).toHaveLength(1));

    const marker = state.markers[0];
    if (!marker) throw new Error('marker not created');
    marker.current = { lat: -16.26, lng: -47.96 };
    marker.dragend?.();
    expect(onChange).toHaveBeenCalledWith({ lat: -16.26, lng: -47.96 });

    rerender(
      <LocationMap position={null} cityBounds={null} onChange={onChange} />,
    );
    expect(marker.removed).toBe(true);
  });

  it('shows a skeleton while loading, then hides it', async () => {
    renderWithProviders(
      <LocationMap position={null} cityBounds={null} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId('map-loading')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId('map-loading')).not.toBeInTheDocument(),
    );
  });

  it('without an API key shows the translated notice, never the raw message', async () => {
    loader.loadGoogleMaps.mockRejectedValue(new MapsUnavailableError('no_key'));
    renderWithProviders(
      <LocationMap position={null} cityBounds={null} onChange={vi.fn()} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Configure a chave do Google Maps',
    );
    expect(fakeMaps.Map).not.toHaveBeenCalled();
  });

  it('a failed load shows the load_failed notice', async () => {
    loader.loadGoogleMaps.mockRejectedValue(new Error('boom'));
    renderWithProviders(
      <LocationMap position={null} cityBounds={null} onChange={vi.fn()} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o Google Maps',
    );
  });
});
