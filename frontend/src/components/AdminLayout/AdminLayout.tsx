import { Outlet } from 'react-router-dom';

import Sidebar from '../Sidebar';
import Topbar from '../Topbar';

export default function AdminLayout() {
  return (
    <div className="flex h-screen bg-canvas text-fg antialiased">
      <Sidebar />
      {/* min-h-0/min-w-0: sem isso o filho flex cresce até o conteúdo, o
          container do topo estoura a viewport e a página ganha uma segunda
          barra de rolagem além da do próprio conteúdo. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
