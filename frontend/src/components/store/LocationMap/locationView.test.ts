import { describe, expect, it } from 'vitest';

import {
  initialView,
  positionOf,
  roundLatLng,
  STREET_ZOOM,
} from './locationView.ts';

describe('initialView', () => {
  it('pino marcado: centraliza nele com zoom de rua', () => {
    expect(initialView({ lat: -16.25, lng: -47.95 }, null)).toEqual({
      kind: 'point',
      center: [-16.25, -47.95],
      zoom: STREET_ZOOM,
    });
  });

  it('sem pino: usa a cidade da aba Entrega, senão o Brasil', () => {
    const city: [[number, number], [number, number]] = [
      [-16.3, -48],
      [-16.1, -47.8],
    ];
    expect(initialView(null, city)).toEqual({ kind: 'bounds', bounds: city });
    const brazil = initialView(null, null);
    expect(brazil.kind).toBe('bounds');
  });
});

describe('positionOf', () => {
  it('só devolve ponto com os dois valores', () => {
    expect(positionOf({ latitude: 1, longitude: 2 })).toEqual({
      lat: 1,
      lng: 2,
    });
    expect(positionOf({ latitude: 1, longitude: null })).toBeNull();
    expect(positionOf({ latitude: 0, longitude: 0 })).toEqual({
      lat: 0,
      lng: 0,
    });
  });
});

describe('roundLatLng', () => {
  it('arredonda a 6 casas', () => {
    expect(roundLatLng({ lat: -16.123456789, lng: -47.987654321 })).toEqual({
      lat: -16.123457,
      lng: -47.987654,
    });
  });
});
