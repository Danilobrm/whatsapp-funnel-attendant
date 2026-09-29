import { describe, expect, it } from 'vitest';

import {
  boundsOf,
  maskRings,
  neighborhoodStyle,
  darkMapStyles,
  padBounds,
  neighborhoodsBounds,
  outerRings,
} from './mapGeometry.ts';

import type { AreaGeometry } from '../../../api/store/store.ts';

const SQUARE: AreaGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-47.9, -16.3],
      [-47.8, -16.3],
      [-47.8, -16.2],
      [-47.9, -16.3],
    ],
  ],
};

const MULTI: AreaGeometry = {
  type: 'MultiPolygon',
  coordinates: [
    SQUARE.coordinates,
    [
      [
        [-40, -10],
        [-39, -10],
        [-39, -9],
        [-40, -10],
      ],
    ],
  ],
};

describe('outerRings', () => {
  it('troca [lon, lat] por [lat, lon]', () => {
    expect(outerRings(SQUARE)[0]?.[0]).toEqual([-16.3, -47.9]);
  });

  it('uma entrada por parte do MultiPolygon', () => {
    expect(outerRings(MULTI)).toHaveLength(2);
  });
});

describe('maskRings', () => {
  it('mundo primeiro, cidade como buraco', () => {
    const rings = maskRings(SQUARE);
    expect(rings).toHaveLength(2);
    expect(rings[0]).toHaveLength(4);
    // mesmos pontos da cidade (o sentido pode inverter p/ furar o polígono)
    expect(new Set(rings[1]?.map(String))).toEqual(
      new Set(outerRings(SQUARE)[0]?.map(String)),
    );
  });
});

describe('boundsOf', () => {
  it('caixa sul-oeste / norte-leste', () => {
    expect(boundsOf(SQUARE)).toEqual([
      [-16.3, -47.9],
      [-16.2, -47.8],
    ]);
    expect(boundsOf(MULTI)?.[1]).toEqual([-9, -39]);
  });

  it('null sem pontos', () => {
    expect(boundsOf({ type: 'MultiPolygon', coordinates: [] })).toBeNull();
  });
});

describe('neighborhoodsBounds', () => {
  it('une as caixas de todos os bairros', () => {
    expect(
      neighborhoodsBounds([{ geometry: SQUARE }, { geometry: MULTI }]),
    ).toEqual([
      [-16.3, -47.9],
      [-9, -39],
    ]);
  });

  it('null sem bairros', () => {
    expect(neighborhoodsBounds([])).toBeNull();
  });
});

describe('neighborhoodStyle', () => {
  const palette = { accent: 'A', danger: 'D', canvas: 'C' };

  it('selecionado usa a cor de perigo, mais grosso', () => {
    expect(neighborhoodStyle('selected', palette)).toMatchObject({
      strokeColor: 'D',
      strokeWeight: 3,
    });
  });

  it('com taxa preenche com a cor de destaque', () => {
    expect(neighborhoodStyle('configured', palette)).toMatchObject({
      fillColor: 'A',
    });
  });

  it('o selecionado fica por cima (zIndex maior)', () => {
    const z = (state: 'selected' | 'configured' | 'idle') =>
      neighborhoodStyle(state, palette).zIndex;
    expect(z('selected')).toBeGreaterThan(z('configured'));
    expect(z('configured')).toBeGreaterThan(z('idle'));
  });

  it('sem taxa fica quase transparente', () => {
    expect(neighborhoodStyle('idle', palette).fillOpacity).toBeLessThan(0.1);
  });
});

describe('maskRings winding', () => {
  const area = (ring: [number, number][]) =>
    ring.reduce((sum, [lat1, lng1], i) => {
      const [lat2, lng2] = ring[(i + 1) % ring.length] as [number, number];
      return sum + (lng1 * lat2 - lng2 * lat1);
    }, 0) / 2;

  it('mundo anti-horário e buraco horário, seja qual for o sentido do OSM', () => {
    const ccw: AreaGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    };
    const cw: AreaGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
        ],
      ],
    };
    for (const geometry of [ccw, cw]) {
      const [world, hole] = maskRings(geometry);
      expect(area(world as [number, number][])).toBeGreaterThan(0);
      expect(area(hole as [number, number][])).toBeLessThan(0);
    }
  });
});

describe('padBounds', () => {
  it('aumenta a caixa em cada lado e respeita os limites do Mercator', () => {
    expect(
      padBounds(
        [
          [0, 0],
          [10, 20],
        ],
        0.5,
      ),
    ).toEqual([
      [-5, -10],
      [15, 30],
    ]);
    const [[south], [north]] = padBounds(
      [
        [-80, 0],
        [80, 1],
      ],
      1,
    );
    expect(south).toBe(-85);
    expect(north).toBe(85);
  });
});

describe('darkMapStyles', () => {
  it('usa só as cores recebidas (tokens já resolvidos)', () => {
    const json = JSON.stringify(
      darkMapStyles({ background: 'BG', text: 'TX', border: 'BD' }),
    );
    expect(json).toContain('BG');
    expect(json).toContain('TX');
    expect(json).toContain('BD');
    expect(json).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
