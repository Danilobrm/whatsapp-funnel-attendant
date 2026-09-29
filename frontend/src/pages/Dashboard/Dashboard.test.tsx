import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen, within } from '../../test/render.tsx';

vi.mock('../../api/dashboard/dashboard.ts', () => ({ fetchDashboard: vi.fn() }));

import {
  fetchDashboard,
  type Dashboard as DashboardData,
} from '../../api/dashboard/dashboard.ts';
import Dashboard from './Dashboard.tsx';

const fetchMock = vi.mocked(fetchDashboard);

const DATA: DashboardData = {
  timezone: 'America/Sao_Paulo',
  today: {
    orders: 4,
    revenueCents: 10000,
    ticketCents: 2500,
    rejected: 1,
    active: 3,
  },
  last7Days: [
    { day: '2026-09-23', orders: 0, revenueCents: 0, rejected: 0 },
    { day: '2026-09-24', orders: 0, revenueCents: 0, rejected: 0 },
    { day: '2026-09-25', orders: 0, revenueCents: 0, rejected: 0 },
    { day: '2026-09-26', orders: 0, revenueCents: 0, rejected: 0 },
    { day: '2026-09-27', orders: 0, revenueCents: 0, rejected: 0 },
    { day: '2026-09-28', orders: 1, revenueCents: 3000, rejected: 0 },
    { day: '2026-09-29', orders: 4, revenueCents: 10000, rejected: 1 },
  ],
  topItems: [
    { name: 'X-Tudo', quantity: 4, revenueCents: 10000 },
    { name: 'Refrigerante 2L', quantity: 2, revenueCents: 2400 },
  ],
  fulfillment: [
    { key: 'delivery', count: 3 },
    { key: 'pickup', count: 1 },
  ],
  payment: [
    { key: 'pix', count: 3 },
    { key: 'voucher', count: 1 },
  ],
  store: { open: true, paused: false, nextOpeningAt: null },
  menuFunnel: { sent: 10, opened: 7, confirmed: 5, ordered: 4 },
};

function renderPage() {
  return renderWithProviders(<Dashboard />, { route: '/admin/dashboard' });
}

function card(label: string) {
  return within(
    screen.getByRole('heading', { name: label }).closest('section')!,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard page', () => {
  it('keeps titles and labels visible while the numbers load', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Visão geral' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Pedidos hoje' }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('stat-skeleton')).toHaveLength(4);
    expect(screen.getByTestId('chart-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('store-status-skeleton')).toBeInTheDocument();
  });

  it('shows today numbers formatted in BRL', async () => {
    fetchMock.mockResolvedValue({ dashboard: DATA });
    renderPage();

    expect(await card('Pedidos hoje').findByText('4')).toBeInTheDocument();
    expect(
      card('Pedidos hoje').getByText('1 recusados ou cancelados'),
    ).toBeInTheDocument();
    expect(card('Faturamento hoje').getByText('R$ 100,00')).toBeInTheDocument();
    expect(card('Ticket médio hoje').getByText('R$ 25,00')).toBeInTheDocument();
    expect(card('Em andamento agora').getByText('3')).toBeInTheDocument();
    expect(
      card('Em andamento agora').getByRole('link', { name: 'Ver pedidos' }),
    ).toHaveAttribute('href', '/admin/orders');
    expect(screen.getByRole('status')).toHaveTextContent('Loja aberta');
  });

  it('lists best sellers and no longer shows delivery or payment breakdowns', async () => {
    fetchMock.mockResolvedValue({ dashboard: DATA });
    renderPage();

    const top = card('Mais vendidos');
    expect(await top.findByText('X-Tudo')).toBeInTheDocument();
    expect(top.getByText('4 vendidos · R$ 100,00')).toBeInTheDocument();

    expect(screen.queryByText('Entrega × retirada')).not.toBeInTheDocument();
    expect(screen.queryByText('Formas de pagamento')).not.toBeInTheDocument();
  });

  it('shows the menu link funnel with the share of those who got the link', async () => {
    fetchMock.mockResolvedValue({ dashboard: DATA });
    renderPage();

    const funnel = card('Funil do cardápio');
    expect(await funnel.findByText('Receberam o link')).toBeInTheDocument();
    expect(funnel.getByText('10 · 100%')).toBeInTheDocument();
    expect(funnel.getByText('Abriram o cardápio')).toBeInTheDocument();
    expect(funnel.getByText('7 · 70%')).toBeInTheDocument();
    expect(funnel.getByText('Montaram o carrinho')).toBeInTheDocument();
    expect(funnel.getByText('5 · 50%')).toBeInTheDocument();
    expect(funnel.getByText('Fizeram o pedido')).toBeInTheDocument();
    expect(funnel.getByText('4 · 40%')).toBeInTheDocument();
  });

  it('says so when no link was sent (no division by zero)', async () => {
    fetchMock.mockResolvedValue({
      dashboard: {
        ...DATA,
        menuFunnel: { sent: 0, opened: 0, confirmed: 0, ordered: 0 },
      },
    });
    renderPage();

    expect(
      await card('Funil do cardápio').findByText(
        'Nenhum link do cardápio foi enviado nos últimos 7 dias.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('keeps the funnel panel title visible while loading', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Funil do cardápio' }),
    ).toBeInTheDocument();
  });

  it('shows the load error when the first fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('HTTP 500'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o resumo.',
    );
  });
});
