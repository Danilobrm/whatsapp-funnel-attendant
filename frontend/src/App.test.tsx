import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from './test/render.tsx';

vi.mock('./api/menu/menu.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/menu/menu.ts')>();
  // Pendente para sempre: só interessa em qual página a rota cai.
  return { ...actual, fetchMenu: vi.fn(() => new Promise(() => {})) };
});

vi.mock('./api/store/store.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/store/store.ts')>();
  return {
    ...actual,
    fetchStoreSettings: vi.fn(() => new Promise(() => {})),
    fetchZones: vi.fn(() => new Promise(() => {})),
  };
});

vi.mock('./api/orders/orders.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/orders/orders.ts')>();
  return {
    ...actual,
    fetchOrders: vi.fn(() => new Promise(() => {})),
  };
});

vi.mock('./api/orders/orderStream.ts', () => ({
  openOrderStream: vi.fn(() => new Promise(() => {})),
}));

vi.mock('./api/publicMenu/publicMenu.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/publicMenu/publicMenu.ts')>();
  return { ...actual, fetchPublicMenu: vi.fn(() => new Promise(() => {})) };
});

vi.mock('./api/dashboard/dashboard.ts', () => ({
  fetchDashboard: vi.fn(() => new Promise(() => {})),
}));

import App from './App.tsx';

const SIGNED_IN = {
  user: { id: 1, email: 'dono@teste.com', tenantId: 1 },
  isAuthenticated: true,
};

describe('App routes', () => {
  it('/admin/menu is the Cardápio page, with its own sidebar item', () => {
    renderWithProviders(<App />, {
      route: '/admin/menu',
      authValue: SIGNED_IN as never,
    });

    expect(
      screen.getByRole('heading', { name: 'Cardápio' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cardápio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Sem as abas da Loja.
    expect(
      screen.queryByRole('link', { name: 'Geral' }),
    ).not.toBeInTheDocument();
  });

  it('old /admin/store/menu redirects to /admin/menu', () => {
    renderWithProviders(<App />, {
      route: '/admin/store/menu',
      authValue: SIGNED_IN as never,
    });

    expect(screen.getByRole('link', { name: 'Cardápio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it.each([
    ['/admin/store', 'Geral'],
    ['/admin/store/hours', 'Horários'],
    ['/admin/store/payment', 'Pagamento'],
  ])('%s keeps the Loja title and tabs, with %s active', (route, tab) => {
    renderWithProviders(<App />, { route, authValue: SIGNED_IN as never });

    expect(screen.getByRole('heading', { name: 'Loja' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: tab })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Loja' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('/admin opens on the Visão geral (dashboard) tab', () => {
    renderWithProviders(<App />, {
      route: '/admin',
      authValue: SIGNED_IN as never,
    });

    expect(
      screen.getByRole('heading', { name: 'Visão geral' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Visão geral' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('/admin/orders still opens the Pedidos board', () => {
    renderWithProviders(<App />, {
      route: '/admin/orders',
      authValue: SIGNED_IN as never,
    });

    expect(
      screen.getByRole('heading', { name: 'Pedidos' }),
    ).toBeInTheDocument();
  });

  // O cliente final abre o link SEM login: a rota não pode cair no /login.
  it('the menu link (/c/:token) is public — no login redirect, no admin shell', () => {
    renderWithProviders(<App />, {
      route: '/c/abc.def.ghi',
      authValue: { user: null, isAuthenticated: false },
    });

    expect(
      screen.getAllByTestId('public-item-skeleton').length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: /Entrar|Sign in/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Navegação principal' }),
    ).not.toBeInTheDocument();
  });
});
