import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../test/render.tsx';
import Sidebar, { MobileNav } from './Sidebar.tsx';

describe('Sidebar', () => {
  it('lists Visão geral first and Pedidos second', () => {
    renderWithProviders(<Sidebar />, { route: '/admin/dashboard' });

    const [first, second] = screen.getAllByRole('link');
    expect(first).toHaveAttribute('href', '/admin/dashboard');
    expect(first).toHaveAccessibleName('Visão geral');
    expect(first).toHaveAttribute('aria-current', 'page');
    expect(second).toHaveAttribute('href', '/admin/orders');
    expect(second).toHaveAccessibleName('Pedidos');
  });

  it('lists the nav links in order, simulator last', () => {
    renderWithProviders(<Sidebar />, { route: '/admin/store' });

    const links = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      '/admin/dashboard',
      '/admin/orders',
      '/admin/menu',
      '/admin/whatsapp',
      '/admin/store',
      '/admin/simulator',
    ]);
  });

  it('shows a visible label under every icon', () => {
    renderWithProviders(<Sidebar />, { route: '/admin/dashboard' });

    for (const name of [
      'Visão geral',
      'Pedidos',
      'Cardápio',
      'WhatsApp',
      'Loja',
      'Simulador',
    ]) {
      expect(screen.getByText(name)).toBeVisible();
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('groups daily work on top and Loja + Simulador at the bottom', () => {
    renderWithProviders(<Sidebar />, { route: '/admin/dashboard' });

    const [top, bottom] = Array.from(
      screen.getByRole('complementary').children,
    );
    const hrefs = (el?: Element) =>
      Array.from(el?.querySelectorAll('a') ?? []).map((a) =>
        a.getAttribute('href'),
      );
    expect(hrefs(top)).toEqual([
      '/admin/dashboard',
      '/admin/orders',
      '/admin/menu',
      '/admin/whatsapp',
    ]);
    expect(hrefs(bottom)).toEqual(['/admin/store', '/admin/simulator']);
  });
});

describe('MobileNav', () => {
  it('renders nothing while closed', () => {
    renderWithProviders(<MobileNav open={false} onClose={() => {}} />, {
      route: '/admin/dashboard',
    });
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('lists every link and closes via the close button', async () => {
    const onClose = vi.fn();
    renderWithProviders(<MobileNav open onClose={onClose} />, {
      route: '/admin/dashboard',
    });
    expect(screen.getAllByRole('link')).toHaveLength(6);
    onClose.mockClear();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Fechar menu' })[0]!,
    );
    expect(onClose).toHaveBeenCalled();
  });
});
