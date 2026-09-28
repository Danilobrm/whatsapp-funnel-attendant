import { NavLink } from 'react-router-dom';

import { useT } from '../../../i18n/index.tsx';

/** Abas de `/admin/store` — cada uma é uma página própria (fetch/autosave independentes), não um estado local. */
export default function StoreTabs() {
  const t = useT();

  return (
    <nav className="flex gap-1 border-b border-line">
      <NavLink
        to="/admin/store"
        end
        className={({ isActive }) =>
          `border-b-2 px-4 py-2.5 text-sm font-medium transition ${
            isActive
              ? 'border-accent text-fg'
              : 'border-transparent text-fg-muted hover:text-fg'
          }`
        }
      >
        {t('store.tabs.general')}
      </NavLink>
      <NavLink
        to="/admin/store/delivery"
        className={({ isActive }) =>
          `border-b-2 px-4 py-2.5 text-sm font-medium transition ${
            isActive
              ? 'border-accent text-fg'
              : 'border-transparent text-fg-muted hover:text-fg'
          }`
        }
      >
        {t('store.tabs.delivery')}
      </NavLink>
    </nav>
  );
}
