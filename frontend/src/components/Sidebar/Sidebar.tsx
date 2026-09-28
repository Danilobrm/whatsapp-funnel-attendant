import type { ComponentType, SVGProps } from 'react';
import { NavLink } from 'react-router-dom';
import { Bot, FlaskConical } from 'lucide-react';

import { useT } from '../../i18n/index.tsx';

type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { strokeWidth?: number }
>;

interface NavItem {
  to: string;
  labelKey: string;
  Icon: IconComponent;
  end?: boolean;
}

const topItems: NavItem[] = [
  {
    to: '/admin/simulator',
    labelKey: 'sidebar.simulator',
    Icon: FlaskConical as IconComponent,
  },
];

const bottomItems: NavItem[] = [
  {
    to: '/admin/settings',
    labelKey: 'sidebar.settings',
    Icon: Bot as IconComponent,
  },
];

function SidebarLink({ to, labelKey, Icon, end }: NavItem) {
  const t = useT();
  const label = t(labelKey);

  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        `flex h-10 w-10 items-center justify-center rounded-xl transition ${
          isActive
            ? 'bg-hover text-fg'
            : 'text-fg-subtle hover:bg-hover hover:text-fg'
        }`
      }
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-label={label} />
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="flex h-screen w-16 flex-none flex-col items-center justify-between border-r border-line bg-canvas py-4">
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
