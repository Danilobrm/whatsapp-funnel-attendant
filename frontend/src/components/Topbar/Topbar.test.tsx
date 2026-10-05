import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Topbar from './Topbar.tsx';
import { renderWithProviders, screen } from '../../test/render.tsx';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const USER = {
  id: 11,
  email: 'danilo@admin.com',
  tenant: { id: 1, slug: 'pizzaria-demo', name: 'Pizzaria Demo' },
};

beforeEach(() => {
  navigateMock.mockReset();
});

function renderTopbar(
  authValue: Record<string, unknown> = { user: USER, logout: vi.fn() },
  route = '/admin',
) {
  return renderWithProviders(<Topbar />, { route, authValue });
}

describe('Topbar — conta', () => {
  it('mostra o avatar com a inicial do e-mail', () => {
    renderTopbar();

    expect(
      screen.getByRole('button', { name: 'Menu da conta' }),
    ).toHaveTextContent('D');
  });

  it('não mostra nada de conta quando anônimo', () => {
    renderTopbar({ user: null, logout: vi.fn() });

    expect(
      screen.queryByRole('button', { name: 'Menu da conta' }),
    ).not.toBeInTheDocument();
  });

  it('começa fechado e abre no clique', async () => {
    renderTopbar();
    const trigger = screen.getByRole('button', { name: 'Menu da conta' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('exibe e-mail e empresa acima do Sair', async () => {
    renderTopbar();

    await userEvent.click(
      screen.getByRole('button', { name: 'Menu da conta' }),
    );

    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('danilo@admin.com');
    expect(menu).toHaveTextContent('Pizzaria Demo');
    expect(screen.getByRole('menuitem', { name: /sair/i })).toBeInTheDocument();
  });

  it('desloga e volta para o login', async () => {
    const logout = vi.fn();
    renderTopbar({ user: USER, logout });

    await userEvent.click(
      screen.getByRole('button', { name: 'Menu da conta' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /sair/i }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('fecha ao clicar fora', async () => {
    renderTopbar();
    await userEvent.click(
      screen.getByRole('button', { name: 'Menu da conta' }),
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.click(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('fecha com Escape', async () => {
    renderTopbar();
    await userEvent.click(
      screen.getByRole('button', { name: 'Menu da conta' }),
    );

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Topbar hamburger', () => {
  it('shows the menu button only when onMenuClick is given', async () => {
    const onMenuClick = vi.fn();
    const authValue = { user: USER, logout: vi.fn() };
    const { unmount } = renderWithProviders(
      <Topbar onMenuClick={onMenuClick} />,
      { route: '/admin', authValue },
    );
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(onMenuClick).toHaveBeenCalled();
    unmount();
    renderWithProviders(<Topbar />, { route: '/admin', authValue });
    expect(screen.queryByRole('button', { name: 'Abrir menu' })).toBeNull();
  });
});
