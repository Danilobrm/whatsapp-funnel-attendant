import { Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth/useAuth.tsx';
import { useT } from '../../i18n/index.tsx';

import AccountMenu from '../AccountMenu/AccountMenu.tsx';

export default function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const t = useT();
  const { isAuthenticated, user, revalidating, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="flex h-14 flex-none items-center justify-between border-b border-line bg-canvas px-3 md:px-6">
      <div className="flex items-center gap-1">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label={t('sidebar.open')}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover md:hidden"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
        <span className="px-1 text-sm font-medium text-fg">
          {t('common.appName')}
        </span>
      </div>
      <div className="flex items-center gap-1">
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
