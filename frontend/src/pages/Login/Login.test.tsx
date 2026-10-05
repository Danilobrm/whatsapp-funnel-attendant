import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '../../api/auth/auth.ts';
import Login from './Login.tsx';
import { renderWithProviders, screen, waitFor } from '../../test/render.tsx';

const navigateMock = vi.fn();
let locationState: { from?: string } | null = null;

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: locationState, pathname: '/login' }),
  };
});

function renderLogin(
  authValue: Parameters<typeof renderWithProviders>[1] extends infer O
    ? O extends { authValue?: infer A }
      ? A
      : never
    : never = {},
) {
  return renderWithProviders(<Login />, { route: '/login', authValue });
}

beforeEach(() => {
  navigateMock.mockReset();
  locationState = null;
});

describe('Login', () => {
  it('renderiza campo de e-mail, não de usuário', () => {
    renderLogin({ login: vi.fn() });

    const email = screen.getByLabelText(/e-mail/i);
    expect(email).toHaveAttribute('type', 'email');
    expect(screen.queryByLabelText(/usuário/i)).not.toBeInTheDocument();
  });

  it('envia e-mail e senha e navega para /admin', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    renderLogin({ login });

    await userEvent.type(screen.getByLabelText(/e-mail/i), 'danilo@admin.com');
    await userEvent.type(screen.getByLabelText(/senha/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(login).toHaveBeenCalledWith('danilo@admin.com', '123456');
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/admin', { replace: true }),
    );
  });

  it('volta para a rota que exigiu autenticação', async () => {
    locationState = { from: '/admin/settings' };
    renderLogin({ login: vi.fn().mockResolvedValue(undefined) });

    await userEvent.type(screen.getByLabelText(/e-mail/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/senha/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/admin/settings', {
        replace: true,
      }),
    );
  });

  it('mostra a mensagem do code devolvido pelo backend', async () => {
    renderLogin({
      login: vi.fn().mockRejectedValue(new AuthError('invalid_credentials')),
    });

    await userEvent.type(screen.getByLabelText(/e-mail/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/senha/i), 'errada');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-mail ou senha inválidos.',
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('cai no genérico para code desconhecido — nunca mostra a chave crua', async () => {
    renderLogin({
      login: vi.fn().mockRejectedValue(new AuthError('code_do_futuro')),
    });

    await userEvent.type(screen.getByLabelText(/e-mail/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/senha/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Não foi possível entrar. Tente novamente.',
    );
    expect(alert).not.toHaveTextContent('login.errors');
  });

  it('trata erro não-AuthError como falha de rede', async () => {
    renderLogin({ login: vi.fn().mockRejectedValue(new Error('boom')) });

    await userEvent.type(screen.getByLabelText(/e-mail/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/senha/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Falha de conexão com o servidor.',
    );
  });

  it('avisa sobre sessão expirada com role="status", não "alert"', () => {
    renderLogin({ login: vi.fn(), sessionExpired: true });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Sua sessão expirou. Entre novamente.',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('desabilita o botão enquanto envia', async () => {
    let resolve: () => void = () => undefined;
    renderLogin({
      login: vi.fn(
        () =>
          new Promise<void>((r) => {
            resolve = r;
          }),
      ),
    });

    await userEvent.type(screen.getByLabelText(/e-mail/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/senha/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /entrando/i })).toBeDisabled(),
    );
    resolve();
  });
});
