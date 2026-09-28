import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';

import { AuthContext, type AuthContextValue } from '../hooks/useAuth';
import { I18nProvider } from '../i18n/index.tsx';

interface Wrapper {
  children: ReactNode;
}

export interface ProviderOptions {
  /** Envolve em <MemoryRouter> começando nesta rota. */
  route?: string;
  /**
   * Injeta um AuthContext falso, sem rede. Preferido a montar o AuthProvider
   * de verdade, que dispararia GET /api/auth/me em todo teste de componente.
   */
  authValue?: Partial<AuthContextValue>;
}

const ANONYMOUS: AuthContextValue = {
  user: null,
  isAuthenticated: false,
  revalidating: false,
  sessionExpired: false,
  login: async () => undefined,
  logout: () => undefined,
};

/**
 * Os providers extras são OPT-IN. Ligar AuthProvider por padrão faria cada
 * chamada existente de `renderWithProviders` disparar `/api/auth/me` e exigir
 * stub de fetch em arquivos que hoje não precisam de nenhum.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: Omit<RenderOptions, 'wrapper'> & ProviderOptions = {},
) {
  const { route, authValue, ...renderOptions } = options;

  function AllProviders({ children }: Wrapper) {
    let tree: ReactNode = children;

    if (authValue) {
      const value: AuthContextValue = {
        ...ANONYMOUS,
        ...authValue,
        isAuthenticated:
          authValue.isAuthenticated ?? Boolean(authValue.user ?? null),
      };
      tree = <AuthContext.Provider value={value}>{tree}</AuthContext.Provider>;
    }

    if (route !== undefined) {
      tree = <MemoryRouter initialEntries={[route]}>{tree}</MemoryRouter>;
    }

    return <I18nProvider>{tree}</I18nProvider>;
  }

  return render(ui, { wrapper: AllProviders, ...renderOptions });
}

export * from '@testing-library/react';
