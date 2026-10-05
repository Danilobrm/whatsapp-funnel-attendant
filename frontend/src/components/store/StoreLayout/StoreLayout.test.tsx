import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { renderWithProviders, screen } from '../../../test/render.tsx';
import StoreLayout from './StoreLayout.tsx';

function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/store" element={<StoreLayout />}>
        <Route index element={<p>conteúdo geral</p>} />
        <Route path="hours" element={<p>conteúdo horários</p>} />
      </Route>
    </Routes>,
    { route },
  );
}

describe('StoreLayout', () => {
  it('shows the Loja title and the tabs above the active tab content', () => {
    renderAt('/admin/store');

    expect(screen.getByRole('heading', { name: 'Loja' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Geral' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('conteúdo geral')).toBeInTheDocument();
  });

  it('keeps title and tabs when the tab changes; only the content swaps', () => {
    renderAt('/admin/store/hours');

    expect(screen.getByRole('heading', { name: 'Loja' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Horários' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('conteúdo horários')).toBeInTheDocument();
    expect(screen.queryByText('conteúdo geral')).not.toBeInTheDocument();
  });
});
