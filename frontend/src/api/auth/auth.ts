import { request } from '../client';

export interface AuthTenant {
  id: number;
  slug: string;
  name: string;
}

export interface AuthUser {
  id: number;
  email: string;
  tenant: AuthTenant;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

/**
 * `message === code` de propósito: a página renderiza `login.errors.<code>` e
 * nunca a mensagem crua, conforme a regra de tratamento de erros.
 */
export class AuthError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'AuthError';
    this.code = code;
  }
}

function toAuthError(fallback: string) {
  return (payload: unknown): Error => {
    const code = (payload as { code?: string } | null)?.code;
    return new AuthError(code ?? fallback);
  };
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    // Sem bearer: um token velho no storage não pode interferir no login.
    auth: false,
    // Mapear o 401 aqui é o que tira este caminho do logout global — senão
    // uma senha errada dispararia "sessão expirou" e um redirect.
    onStatus: {
      401: toAuthError('invalid_credentials'),
      429: toAuthError('rate_limited'),
    },
  });
}

/** Revalida a sessão guardada. Um 401 aqui cai no logout global, como deve. */
export async function fetchCurrentUser(
  signal?: AbortSignal,
): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>('/api/auth/me', {
    ...(signal ? { signal } : {}),
  });
  return data.user;
}
