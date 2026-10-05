import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import RequireAuth from './RequireAuth.tsx';
import { AuthProvider } from '../../hooks/useAuth/useAuth.tsx';
import {
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
} from '../../api/authToken/authToken.ts';

// O provider revalida a sessão no boot; sem stub isso vira ruído de rede.
vi.mock('../../api/auth/auth.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/auth/auth.ts')>();
  return {
    ...actual,
    fetchCurrentUser: vi.fn(() => new Promise(() => undefined)),
  };
});

const USER = {
  id: 1,
  email: 'danilo@admin.com',
  tenant: { id: 1, slug: 'pizzaria-demo', name: 'Pizzaria Demo' },
};

function LoginProbe() {
  const location = useLocation();
  const state = location.state as { from?: string } | null;
  return <div>LOGIN PAGE from:{state?.from ?? '-'}</div>;
}

function setup(initialEntries: string[]) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/admin" element={<div>PROTECTED</div>} />
          </Route>
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function seedSession() {
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'jwt');
  window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(USER));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('RequireAuth', () => {
  it('redirects to /login when unauthenticated', () => {
    setup(['/admin']);

    expect(screen.getByText(/LOGIN PAGE/)).toBeInTheDocument();
    expect(screen.queryByText('PROTECTED')).toBeNull();
  });

  it('renders outlet when authenticated', () => {
    seedSession();

    setup(['/admin']);

    // Sem waitFor: a hidratação é síncrona, então não há piscar de tela.
    expect(screen.getByText('PROTECTED')).toBeInTheDocument();
  });

  it('treats a token without the user snapshot as logged out', () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'jwt');

    setup(['/admin']);

    expect(screen.queryByText('PROTECTED')).toBeNull();
  });

  it('preserves search and hash in the from breadcrumb', () => {
    setup(['/admin?tab=pedidos#top']);

    expect(
      screen.getByText('LOGIN PAGE from:/admin?tab=pedidos#top'),
    ).toBeInTheDocument();
  });
});
