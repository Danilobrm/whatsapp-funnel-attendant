import { describe, expect, it } from 'vitest';

import { render, screen } from '../../../test/render.tsx';
import StatCard from './StatCard.tsx';

describe('StatCard', () => {
  it('renders label, value and hint', () => {
    render(<StatCard label="Pedidos hoje" value="12" hint="2 recusados" />);
    expect(
      screen.getByRole('heading', { name: 'Pedidos hoje' }),
    ).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('2 recusados')).toBeInTheDocument();
  });

  it('keeps the label and swaps only the number for a skeleton while loading', () => {
    render(<StatCard label="Pedidos hoje" value="12" loading />);
    expect(
      screen.getByRole('heading', { name: 'Pedidos hoje' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('stat-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('12')).not.toBeInTheDocument();
  });
});
