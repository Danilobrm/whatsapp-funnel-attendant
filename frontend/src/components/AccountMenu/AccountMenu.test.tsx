import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../test/render.tsx';

import AccountMenu, { initialOf } from './AccountMenu.tsx';

import type { AuthUser } from '../../api/auth';

const user: AuthUser = {
  id: 1,
  email: 'danilo@admin.com',
  tenant: { id: 1, slug: 'pizzaria-demo', name: 'Pizzaria Demo' },
};

beforeEach(() => {
  localStorage.clear();
});

describe('AccountMenu — settings drawer', () => {
  it('opens the settings drawer from the menu, closing the menu itself', async () => {
    renderWithProviders(<AccountMenu user={user} onLogout={vi.fn()} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Menu da conta' }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Configurações' }),
    );

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Configurações' }),
    ).toBeInTheDocument();
  });
});

describe('initialOf', () => {
  it.each([
    ['danilo@admin.com', 'D'],
    ['giulia@admin.com', 'G'],
    ['  ana@x.com', 'A'],
    ['Zeta@x.com', 'Z'],
  ])('usa a primeira letra de %s em maiúscula', (email, expected) => {
    expect(initialOf(email)).toBe(expected);
  });

  it('degrada para ? em e-mail vazio em vez de renderizar nada', () => {
    expect(initialOf('   ')).toBe('?');
    expect(initialOf('')).toBe('?');
  });
});
