import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import Sidebar, { MobileNav } from '../Sidebar/Sidebar.tsx';
import Topbar from '../Topbar/Topbar.tsx';

export default function AdminLayout() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-dvh bg-canvas text-fg antialiased">
      <Sidebar />
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />
      {/* min-h-0/min-w-0: sem isso o filho flex cresce até o conteúdo, o
          container do topo estoura a viewport e a página ganha uma segunda
          barra de rolagem além da do próprio conteúdo. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setNavOpen(true)} />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
