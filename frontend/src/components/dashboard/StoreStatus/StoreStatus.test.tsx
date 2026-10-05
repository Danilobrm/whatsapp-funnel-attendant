import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';
import StoreStatus from './StoreStatus.tsx';

function renderStatus(store: Parameters<typeof StoreStatus>[0]['store']) {
  renderWithProviders(
    <StoreStatus store={store} timezone="America/Sao_Paulo" />,
    {
      route: '/admin/dashboard',
    },
  );
}

describe('StoreStatus', () => {
  it('open', () => {
    renderStatus({ open: true, paused: false, nextOpeningAt: null });
    expect(screen.getByRole('status')).toHaveTextContent('Loja aberta');
  });

  it('paused explains the consequence', () => {
    renderStatus({ open: false, paused: true, nextOpeningAt: null });
    expect(screen.getByRole('status')).toHaveTextContent('Loja pausada');
    expect(screen.getByRole('status')).toHaveTextContent('não fecha pedidos');
  });

  it('closed shows the next opening in the store timezone', () => {
    renderStatus({
      open: false,
      paused: false,
      nextOpeningAt: '2026-09-29T21:00:00.000Z',
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loja fechada · abre ter, 18:00',
    );
  });

  it('closed without hours says so', () => {
    renderStatus({ open: false, paused: false, nextOpeningAt: null });
    expect(screen.getByRole('status')).toHaveTextContent(
      'nenhum horário cadastrado',
    );
  });

  it('skeleton while loading, link to the store always visible', () => {
    renderStatus(null);
    expect(screen.getByTestId('store-status-skeleton')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Gerenciar loja' }),
    ).toHaveAttribute('href', '/admin/store');
  });
});
