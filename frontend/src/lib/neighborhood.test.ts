import { describe, expect, it } from 'vitest';

import { normalizeNeighborhood } from './neighborhood.ts';

describe('normalizeNeighborhood', () => {
  it('ignora acento, caixa e espaços extras', () => {
    expect(normalizeNeighborhood('  Jardim   Ingá ')).toBe('jardim inga');
    expect(normalizeNeighborhood('SÃO CAETANO')).toBe('sao caetano');
  });
});
