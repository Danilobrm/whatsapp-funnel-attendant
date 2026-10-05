import { Outlet } from 'react-router-dom';

import Topbar from '../Topbar/Topbar.tsx';

export default function PublicLayout() {
  return (
    <div className="flex h-screen flex-col bg-canvas text-fg antialiased">
      <Topbar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
