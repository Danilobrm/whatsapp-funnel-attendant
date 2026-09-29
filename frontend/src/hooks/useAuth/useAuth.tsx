import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  fetchCurrentUser,
  login as loginRequest,
  type AuthUser,
} from '../../api/auth/auth.ts';
import {
  clearAuthStorage,
  getAuthToken,
  getStoredUserJson,
  setAuthToken,
  setStoredUserJson,
} from '../../api/authToken/authToken.ts';
import { setUnauthorizedHandler } from '../../api/client/client.ts';

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True enquanto a sessão guardada é revalidada no boot. */
  revalidating: boolean;
  /** Um 401 numa chamada autenticada derrubou a sessão. */
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

/**
 * Exportado para os testes injetarem um valor falso sem rede. É preferível a
 * uma prop `initialUser` no provider, que colocaria API só-de-teste no código
 * de produção.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Lê a sessão guardada. O TOKEN é a autoridade: um `auth_user` sozinho é lixo
 * de um logout parcial e conta como deslogado.
 */
function readStoredSession(): AuthUser | null {
  if (!getAuthToken()) return null;

  const raw = getStoredUserJson();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Hidratação SÍNCRONA. É o que faz `isAuthenticated` já estar certo no
  // primeiro render, e por isso `RequireAuth` não precisa de estado de
  // carregamento nem pisca a tela de login a cada F5 em /admin.
  const [user, setUser] = useState<AuthUser | null>(readStoredSession);
  const [revalidating, setRevalidating] = useState(() =>
    Boolean(getAuthToken()),
  );
  const [sessionExpired, setSessionExpired] = useState(false);

  const clearSession = useCallback(() => {
    clearAuthStorage();
    setUser(null);
  }, []);

  useEffect(() => {
    // O handler NÃO navega. Ele só derruba a sessão; `RequireAuth` re-renderiza
    // e emite o próprio <Navigate>, preservando o breadcrumb `from`. É por isso
    // que o AuthProvider pode continuar fora do BrowserRouter.
    setUnauthorizedHandler(() => {
      setSessionExpired(true);
      clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    if (!getAuthToken()) {
      setRevalidating(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    fetchCurrentUser(controller.signal)
      .then((fresh) => {
        if (cancelled) return;
        // Sucesso também atualiza o snapshot: pega rename de tenant/e-mail.
        setStoredUserJson(JSON.stringify(fresh));
        setUser(fresh);
      })
      // Falha de rede não desloga ninguém — só um 401 real desloga, e esse já
      // passou pelo handler global acima.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setRevalidating(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setSessionExpired(false);
    const { token, user: authenticated } = await loginRequest(
      email.trim(),
      password,
    );
    setAuthToken(token);
    setStoredUserJson(JSON.stringify(authenticated));
    setUser(authenticated);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSessionExpired(false);
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      revalidating,
      sessionExpired,
      login,
      logout,
    }),
    [user, revalidating, sessionExpired, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
