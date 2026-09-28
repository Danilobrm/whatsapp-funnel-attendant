import { Navigate, Route, Routes } from 'react-router-dom';

import AdminLayout from './components/AdminLayout';
import PublicLayout from './components/PublicLayout';
import RequireAuth from './components/RequireAuth';
import Login from './pages/Login';
import Settings from './pages/Settings';
import Simulator from './pages/Simulator';

/**
 * O cliente final nunca abre este app — ele conversa pelo WhatsApp. Tudo aqui
 * é painel do restaurante, então a única rota pública é o login.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<Login />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="simulator" replace />} />
          <Route path="simulator" element={<Simulator />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>

      {/* Anônimo cai no login via RequireAuth, que guarda o `from`. */}
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
