import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AuthError } from '../../api/auth';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../i18n/index.tsx';

interface LocationState {
  from?: string;
}

/**
 * `t()` devolve a própria chave quando ela não existe, então um code novo do
 * backend apareceria cru na tela ("login.errors.foo"). Cai no genérico.
 */
function errorMessage(t: (key: string) => string, code: string): string {
  const key = `login.errors.${code}`;
  const message = t(key);
  return message === key ? t('login.errors.generic') : message;
}

export default function Login() {
  const t = useT();
  const { login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorCode(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      // O `code` decide a UX; a mensagem crua do backend nunca é renderizada.
      setErrorCode(err instanceof AuthError ? err.code : 'network');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-fg">{t('login.title')}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t('login.subtitle')}</p>

        {sessionExpired && !errorCode && (
          // role="status" e não "alert": é informação, não falha desta ação.
          <p className="mt-4 text-sm text-fg-muted" role="status">
            {t('login.errors.session_expired')}
          </p>
        )}

        <div className="mt-6 space-y-4">
          <label className="block" htmlFor="login-email">
            <span className="text-xs font-medium text-fg-muted">
              {t('login.email')}
            </span>
            <input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
              required
            />
          </label>

          <label className="block" htmlFor="login-password">
            <span className="text-xs font-medium text-fg-muted">
              {t('login.password')}
            </span>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
              required
            />
          </label>
        </div>

        {errorCode && (
          <p className="mt-4 text-sm text-danger" role="alert">
            {errorMessage(t, errorCode)}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-hover disabled:text-fg-subtle"
        >
          {submitting ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
    </div>
  );
}
