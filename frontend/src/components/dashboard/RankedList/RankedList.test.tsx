import { describe, expect, it } from 'vitest';

import { render, screen } from '../../../test/render.tsx';
import RankedList from './RankedList.tsx';

describe('RankedList', () => {
  it('renders label, value and a proportional bar', () => {
    render(
      <RankedList
        emptyText="vazio"
        rows={[
          { key: 'a', label: 'X-Tudo', value: '4 vendidos', share: 100 },
          { key: 'b', label: 'Refri', value: '2 vendidos', share: 50 },
        ]}
      />,
    );

    expect(screen.getByText('X-Tudo')).toBeInTheDocument();
    expect(screen.getByText('2 vendidos')).toBeInTheDocument();
    const bars = screen.getAllByTestId('ranked-bar');
    expect(bars[0]).toHaveStyle({ width: '100%' });
    expect(bars[1]).toHaveStyle({ width: '50%' });
  });

  it('clamps the share between 0 and 100', () => {
    render(
      <RankedList
        emptyText="vazio"
        rows={[{ key: 'a', label: 'A', value: '', share: 140 }]}
      />,
    );
    expect(screen.getByTestId('ranked-bar')).toHaveStyle({ width: '100%' });
  });

  it('shows the empty text and the skeleton', () => {
    const { rerender } = render(
      <RankedList emptyText="Nada ainda" rows={[]} />,
    );
    expect(screen.getByText('Nada ainda')).toBeInTheDocument();

    rerender(<RankedList emptyText="Nada ainda" rows={[]} loading />);
    expect(screen.getByTestId('ranked-skeleton')).toBeInTheDocument();
  });
});
