import { afterEach, describe, expect, it } from 'vitest';

import { features } from '../../../config/features.ts';
import { renderWithProviders, screen } from '../../../test/render.tsx';
import StoreTabs from './StoreTabs.tsx';

const hrefs = () =>
  screen.getAllByRole('link').map((a) => a.getAttribute('href'));

afterEach(() => {
  features.maps = false;
});

describe('StoreTabs', () => {
  it('sem mapas: Geral → Horários → Pagamento, sem Cardápio nem Entrega', () => {
    features.maps = false;
    renderWithProviders(<StoreTabs />, { route: '/admin/store' });

    expect(hrefs()).toEqual([
      '/admin/store',
      '/admin/store/hours',
      '/admin/store/payment',
    ]);
    expect(screen.getByRole('link', { name: 'Geral' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('com mapas: a aba Entrega volta, por último', () => {
    features.maps = true;
    renderWithProviders(<StoreTabs />, { route: '/admin/store' });

    expect(hrefs().at(-1)).toBe('/admin/store/delivery');
  });
});
