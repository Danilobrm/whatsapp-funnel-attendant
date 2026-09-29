import { useEffect, type ComponentType, type SVGProps } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  X,
  Store,
  UtensilsCrossed,
} from 'lucide-react';

import { useT } from '../../i18n/index.tsx';
import WhatsAppIcon from '../WhatsAppIcon/WhatsAppIcon.tsx';

type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { strokeWidth?: number }
>;

interface NavItem {
  to: string;
  labelKey: string;
  Icon: IconComponent;
  end?: boolean;
}

/** Dia a dia: o que o dono acompanha durante o expediente. */
const topItems: NavItem[] = [
  {
    to: '/admin/dashboard',
    labelKey: 'sidebar.dashboard',
    Icon: LayoutDashboard as IconComponent,
  },
  {
    to: '/admin/orders',
    labelKey: 'sidebar.orders',
    Icon: ClipboardList as IconComponent,
  },
  {
    to: '/admin/menu',
    labelKey: 'sidebar.menu',
    Icon: UtensilsCrossed as IconComponent,
  },
  {
    to: '/admin/whatsapp',
    labelKey: 'sidebar.whatsapp',
    Icon: WhatsAppIcon,
  },
];

/** Configuração e teste: usados de vez em quando, ficam embaixo. */
const bottomItems: NavItem[] = [
  {
    to: '/admin/store',
    labelKey: 'sidebar.store',
    Icon: Store as IconComponent,
  },
  {
    to: '/admin/simulator',
    labelKey: 'sidebar.simulator',
    Icon: FlaskConical as IconComponent,
  },
];

function SidebarLink({
  to,
  labelKey,
  Icon,
  end,
  row,
}: NavItem & { row?: boolean }) {
  const t = useT();
  const label = t(labelKey);

  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) =>
        `flex items-center rounded-xl transition ${
          row
            ? 'h-12 w-full flex-row gap-3 px-3'
            : 'h-14 w-16 flex-col justify-center gap-1'
        } ${
          isActive
            ? 'bg-hover text-fg'
            : 'text-fg-subtle hover:bg-hover hover:text-fg'
        }`
      }
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      <span
        className={
          row ? 'text-sm font-medium' : 'text-[10px] font-medium leading-none'
        }
      >
        {label}
      </span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="hidden h-dvh w-20 flex-none flex-col md:flex items-center justify-between border-r border-line bg-canvas py-4">
      <div className="flex flex-col items-center gap-2">
        {topItems.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        {bottomItems.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </div>
    </aside>
  );
}

/** Mobile: o trilho vira um menu hambúrguer que abre como gaveta. */
export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const { pathname } = useLocation();

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label={t('sidebar.close')}
        onClick={onClose}
        className="absolute inset-0 bg-fg/40"
      />
      <nav
        aria-label={t('sidebar.menuLabel')}
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between border-r border-line bg-canvas p-4"
      >
        <div className="flex flex-col gap-1">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-fg">
              {t('common.appName')}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('sidebar.close')}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted hover:bg-hover"
            >
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          {topItems.map((item) => (
            <SidebarLink key={item.to} {...item} row />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {bottomItems.map((item) => (
            <SidebarLink key={item.to} {...item} row />
          ))}
        </div>
      </nav>
    </div>
  );
}
