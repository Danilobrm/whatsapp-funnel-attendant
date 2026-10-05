import { useEffect, useState } from 'react';

import { fetchDashboard, type Dashboard } from '../../api/dashboard/dashboard.ts';

export const DASHBOARD_REFRESH_MS = 60_000;

/**
 * Carrega o dashboard e atualiza a cada minuto. Não é tela de balcão (essa é
 * Pedidos, com SSE) — um minuto de atraso é aceitável e poupa o servidor.
 * Falha num refresh mantém os números anteriores na tela; só a primeira
 * carga sem dado nenhum vira estado de erro.
 */
export function useDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { dashboard } = await fetchDashboard();
        if (cancelled) return;
        setData(dashboard);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const id = window.setInterval(() => void load(), DASHBOARD_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return { data, loading, error };
}
