import { LogOut, Moon, Settings, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useTheme } from '../../hooks/useTheme/useTheme.ts';
import { useT } from '../../i18n/index.tsx';

import SettingsDrawer from '../SettingsDrawer/SettingsDrawer.tsx';

import type { AuthUser } from '../../api/auth/auth.ts';

/** Inicial mostrada no avatar: primeira letra do e-mail, em maiúscula. */
export function initialOf(email: string): string {
  const first = email.trim().charAt(0);
  return first ? first.toUpperCase() : '?';
}

interface AccountMenuProps {
  user: AuthUser;
  onLogout: () => void;
  /** Some junto com a revalidação da sessão no boot. */
  revalidating?: boolean;
}

export default function AccountMenu({
  user,
  onLogout,
  revalidating = false,
}: AccountMenuProps) {
  const t = useT();
  const { theme, toggle } = useTheme();
  const isLight = theme === 'light';
  const ThemeIcon = isLight ? Moon : Sun;
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('account.menuLabel')}
        title={user.email}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-fg transition hover:opacity-90 active:scale-90 ${
          revalidating ? 'opacity-60' : ''
        }`}
      >
        {initialOf(user.email)}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('account.menuLabel')}
          className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          {/* Cabeçalho informativo: quem está logado e em qual empresa. */}
          <div className="px-4 py-3">
            <p className="truncate text-sm font-medium text-fg">{user.email}</p>
            <p className="mt-0.5 truncate text-xs text-fg-muted">
              {user.tenant.name}
            </p>
          </div>

          <div className="h-px bg-line" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setSettingsOpen(true);
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-fg transition hover:bg-hover"
          >
            <Settings className="h-4 w-4 text-fg-subtle" />
            {t('account.settingsItem')}
          </button>

          <div className="h-px bg-line" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              toggle();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-fg transition hover:bg-hover"
          >
            <ThemeIcon className="h-4 w-4 text-fg-subtle" />
            {isLight ? t('account.themeDark') : t('account.themeLight')}
          </button>

          <div className="h-px bg-line" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-fg transition hover:bg-hover"
          >
            <LogOut className="h-4 w-4 text-fg-subtle" />
            {t('login.logout')}
          </button>
        </div>
      )}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
