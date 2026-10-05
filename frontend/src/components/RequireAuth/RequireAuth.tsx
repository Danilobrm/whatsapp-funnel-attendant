import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth/useAuth.tsx';

/**
 * Sem estado de carregamento DE PROPÓSITO: `useAuth` hidrata do localStorage de
 * forma síncrona, então `isAuthenticated` já é confiável no primeiro render.
 * Adicionar um spinner aqui reintroduziria o piscar a cada F5 — e um spinner de
 * rota inteira contraria a regra de esqueletos.
 */
export default function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Preserva query e hash: voltar para /admin sem os filtros que a pessoa
    // tinha aplicado é perder trabalho dela.
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <Outlet />;
}
