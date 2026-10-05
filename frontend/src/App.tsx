import { Navigate, Route, Routes } from 'react-router-dom';

import AdminLayout from './components/AdminLayout/AdminLayout.tsx';
import PublicLayout from './components/PublicLayout/PublicLayout.tsx';
import RequireAuth from './components/RequireAuth/RequireAuth.tsx';
import Dashboard from './pages/Dashboard/Dashboard.tsx';
import { features } from './config/features.ts';
import Delivery from './pages/Delivery/Delivery.tsx';
import Login from './pages/Login/Login.tsx';
import Menu from './pages/Menu/Menu.tsx';
import Orders from './pages/Orders/Orders.tsx';
import PublicMenu from './pages/PublicMenu/PublicMenu.tsx';
import Simulator from './pages/Simulator/Simulator.tsx';
import StoreLayout from './components/store/StoreLayout/StoreLayout.tsx';
import Store from './pages/Store/Store.tsx';
import StoreHours from './pages/StoreHours/StoreHours.tsx';
import StorePayment from './pages/StorePayment/StorePayment.tsx';
import WhatsApp from './pages/WhatsApp/WhatsApp.tsx';

/**
 * O cliente final conversa pelo WhatsApp. Tudo aqui é painel do restaurante,
 * exceto duas rotas públicas: o login e o cardápio em link (`/c/:token`), que
 * o atendente manda no chat para o cliente ver fotos e montar o carrinho. O
 * cardápio NÃO usa o `PublicLayout` (que tem a barra do painel): é uma página
 * sozinha, feita para o celular.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<Login />} />
      </Route>

      <Route path="/c/:token" element={<PublicMenu />} />

      <Route element={<RequireAuth />}>
        <Route path="/admin" element={<AdminLayout />}>
          {/* Visão geral é a primeira aba — é onde o painel abre. */}
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="simulator" element={<Simulator />} />
          <Route path="menu" element={<Menu />} />
          {/* Cardápio saiu da Loja para a barra lateral; o endereço antigo vale. */}
          <Route
            path="store/menu"
            element={<Navigate to="/admin/menu" replace />}
          />
          <Route path="store" element={<StoreLayout />}>
            <Route index element={<Store />} />
            <Route path="hours" element={<StoreHours />} />
            <Route path="payment" element={<StorePayment />} />
            {features.maps && <Route path="delivery" element={<Delivery />} />}
          </Route>
          <Route path="whatsapp" element={<WhatsApp />} />
        </Route>
      </Route>

      {/* Anônimo cai no login via RequireAuth, que guarda o `from`. */}
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
