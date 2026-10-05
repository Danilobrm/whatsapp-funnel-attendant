import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '../../../test/render.tsx';
import ItemCard from './ItemCard.tsx';

import type { MenuItem } from '../../../api/menu/menu.ts';

const LABELS = {
  noPrice: 'Sem preço',
  moveLeft: 'Mover para a esquerda',
  moveRight: 'Mover para a direita',
};

function item(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 1,
    categoryId: 1,
    name: 'Calabresa',
    description: 'Molho e calabresa',
    priceCents: 4500,
    imageUrl: null,
    available: true,
    active: true,
    position: 0,
    sizes: [],
    optionGroups: [],
    ...overrides,
  };
}

describe('ItemCard', () => {
  it('shows the single price', () => {
    render(<ItemCard item={item()} labels={LABELS} onEdit={vi.fn()} />);
    expect(screen.getByText('R$ 45,00')).toBeInTheDocument();
  });

  it('shows name, description and price only', () => {
    render(<ItemCard item={item()} labels={LABELS} onEdit={vi.fn()} />);
    expect(screen.getByText('Calabresa')).toBeInTheDocument();
    expect(screen.getByText('Molho e calabresa')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('shows the placeholder when the item has no image', () => {
    render(<ItemCard item={item()} labels={LABELS} onEdit={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'Calabresa' }).tagName).not.toBe(
      'IMG',
    );
  });

  it('shows the real image when the item has one', () => {
    render(
      <ItemCard
        item={item({ imageUrl: 'https://example.com/pizza.jpg' })}
        labels={LABELS}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole('img', { name: 'Calabresa' })).toHaveAttribute(
      'src',
      'https://example.com/pizza.jpg',
    );
  });

  it('shows the cheapest size price, without a "from" prefix', () => {
    render(
      <ItemCard
        item={item({
          priceCents: null,
          sizes: [
            { id: 1, name: 'Média', priceCents: 4500, position: 0 },
            { id: 2, name: 'Grande', priceCents: 5800, position: 1 },
          ],
        })}
        labels={LABELS}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('R$ 45,00')).toBeInTheDocument();
  });

  it('has no edit or delete buttons; deleting lives in the drawer', () => {
    render(<ItemCard item={item()} labels={LABELS} onEdit={vi.fn()} />);
    expect(
      screen.queryByRole('button', { name: 'Excluir item' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar item' }),
    ).not.toBeInTheDocument();
  });

  it('opens the editor when the card itself is clicked', async () => {
    const onEdit = vi.fn();
    render(<ItemCard item={item()} labels={LABELS} onEdit={onEdit} />);

    await userEvent.click(screen.getByText('Calabresa'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('hides move buttons when no move callback is provided', () => {
    render(<ItemCard item={item()} labels={LABELS} onEdit={vi.fn()} />);
    expect(
      screen.queryByRole('button', { name: 'Mover para a esquerda' }),
    ).not.toBeInTheDocument();
  });

  it('disables the edge move button and calls the other one', async () => {
    const onMoveRight = vi.fn();
    render(
      <ItemCard
        item={item()}
        labels={LABELS}
        onEdit={vi.fn()}
        onMoveRight={onMoveRight}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Mover para a esquerda' }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Mover para a direita' }),
    );
    expect(onMoveRight).toHaveBeenCalled();
  });
});
