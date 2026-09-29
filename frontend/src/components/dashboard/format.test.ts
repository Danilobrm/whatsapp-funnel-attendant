import { describe, expect, it } from 'vitest';

import { fill, openingLabel, percent, weekdayLabel } from './format.ts';

describe('dashboard format', () => {
  it('weekdayLabel is the calendar day, independent of the browser timezone', () => {
    expect(weekdayLabel('2026-09-29', 'pt-BR')).toBe('ter');
    expect(weekdayLabel('2026-09-29', 'en-US')).toBe('Tue');
  });

  it('openingLabel renders in the store timezone', () => {
    // 21h UTC = 18h em São Paulo.
    expect(
      openingLabel('2026-09-29T21:00:00.000Z', 'pt-BR', 'America/Sao_Paulo'),
    ).toBe('ter, 18:00');
  });

  it('fill replaces placeholders and keeps unknown ones', () => {
    expect(fill('{n} pedidos {x}', { n: 3 })).toBe('3 pedidos {x}');
  });

  it('percent rounds and handles an empty total', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });
});
