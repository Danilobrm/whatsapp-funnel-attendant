import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';
import RevenueChart from './RevenueChart.tsx';

const DAYS = [
  { day: '2026-09-23', orders: 1, revenueCents: 2000, rejected: 0 },
  { day: '2026-09-24', orders: 0, revenueCents: 0, rejected: 0 },
  { day: '2026-09-25', orders: 2, revenueCents: 5000, rejected: 0 },
  { day: '2026-09-26', orders: 0, revenueCents: 0, rejected: 0 },
  { day: '2026-09-27', orders: 3, revenueCents: 9000, rejected: 1 },
  { day: '2026-09-28', orders: 0, revenueCents: 0, rejected: 0 },
  { day: '2026-09-29', orders: 4, revenueCents: 10000, rejected: 0 },
];

describe('RevenueChart', () => {
  it('renders one labelled column per day, today last and highlighted', () => {
    renderWithProviders(<RevenueChart days={DAYS} />);

    const columns = screen.getAllByRole('img');
    expect(columns).toHaveLength(7);
    expect(columns[0]).toHaveAccessibleName('qua: R$ 20,00 · 1 pedido');
    expect(columns[6]).toHaveAccessibleName('Hoje: R$ 100,00 · 4 pedidos');
    expect(columns[6]).toHaveAttribute('data-today', 'true');
  });

  it('writes the value only on today (selective label)', () => {
    renderWithProviders(<RevenueChart days={DAYS} />);
    // Valor visível de hoje + a célula da tabela para leitor de tela.
    expect(screen.getAllByText('R$ 100,00')).toHaveLength(2);
    expect(screen.getAllByText('R$ 90,00')).toHaveLength(1);
  });

  it('shows a tooltip with value and order count on hover', async () => {
    renderWithProviders(<RevenueChart days={DAYS} />);

    await userEvent.hover(screen.getAllByRole('img')[4]!);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('R$ 90,00');
    expect(tooltip).toHaveTextContent('3 pedidos');
  });

  it('carries every number in a screen-reader table', () => {
    renderWithProviders(<RevenueChart days={DAYS} />);
    expect(
      screen.getByRole('table', { name: 'Faturamento nos últimos 7 dias' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(8);
  });

  it('shows the empty state when there is no revenue', () => {
    renderWithProviders(
      <RevenueChart
        days={DAYS.map((d) => ({ ...d, orders: 0, revenueCents: 0 }))}
      />,
    );
    expect(
      screen.getByText('Nenhum pedido nos últimos 7 dias.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
