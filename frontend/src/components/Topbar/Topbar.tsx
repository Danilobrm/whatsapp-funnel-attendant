import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../i18n/index.tsx';

import AccountMenu from '../AccountMenu';
import ThemeToggle from '../ThemeToggle';

export default function Topbar() {
  const t = useT();
  const { isAuthenticated, user, revalidating, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="flex h-14 flex-none items-center justify-between border-b border-line bg-canvas px-6">
      <span className="text-sm font-medium text-fg">{t('common.appName')}</span>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        {isAuthenticated && user && (
          <AccountMenu
            user={user}
            onLogout={handleLogout}
            revalidating={revalidating}
          />
        )}
      </div>
    </header>
  );
}
