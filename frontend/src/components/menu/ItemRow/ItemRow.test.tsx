import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '../../../test/render.tsx';
import ItemRow from './ItemRow.tsx';

import type { MenuItem } from '../../../api/menu';

const LABELS = {
  fromPrice: 'A partir de',
  noPrice: 'Sem preço',
  available: 'Disponível',
  unavailable: 'Esgotado',
  edit: 'Editar item',
  delete: 'Excluir item',
  moveUp: 'Mover para cima',
  moveDown: 'Mover para baixo',
  inactive: 'Removido',
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

describe('ItemRow', () => {
  it('shows the single price', () => {
    render(<ItemRow item={item()} labels={LABELS} onEdit={vi.fn()} onDelete={vi.fn()} onToggleAvailability={vi.fn()} />);
    expect(screen.getByText('R$ 45,00')).toBeInTheDocument();
  });

  it('shows the placeholder when the item has no image', () => {
    render(<ItemRow item={item()} labels={LABELS} onEdit={vi.fn()} onDelete={vi.fn()} onToggleAvailability={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'Calabresa' }).tagName).not.toBe('IMG');
  });

  it('shows the real image when the item has one', () => {
    render(
      <ItemRow
        item={item({ imageUrl: 'https://example.com/pizza.jpg' })}
        labels={LABELS}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleAvailability={vi.fn()}
      />,
    );
    expect(screen.getByRole('img', { name: 'Calabresa' })).toHaveAttribute(
      'src',
      'https://example.com/pizza.jpg',
    );
  });

  it('shows "from" the cheapest size when the item has sizes', () => {
    render(
      <ItemRow
        item={item({
          priceCents: null,
          sizes: [
            { id: 1, name: 'Média', priceCents: 4500, position: 0 },
            { id: 2, name: 'Grande', priceCents: 5800, position: 1 },
          ],
        })}
        labels={LABELS}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleAvailability={vi.fn()}
      />,
    );
    expect(screen.getByText('A partir de R$ 45,00')).toBeInTheDocument();
  });

  it('calls onToggleAvailability with the new value', async () => {
    const onToggle = vi.fn();
    render(
      <ItemRow item={item()} labels={LABELS} onEdit={vi.fn()} onDelete={vi.fn()} onToggleAvailability={onToggle} />,
    );

    await userEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('shows the inactive badge for a removed item', () => {
    render(
      <ItemRow
        item={item({ active: false })}
        labels={LABELS}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleAvailability={vi.fn()}
      />,
    );
    expect(screen.getByText('Removido')).toBeInTheDocument();
  });

  it('calls onEdit and onDelete', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <ItemRow item={item()} labels={LABELS} onEdit={onEdit} onDelete={onDelete} onToggleAvailability={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Editar item' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir item' }));
    expect(onEdit).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });

  it('disables move buttons when the callback is not provided', () => {
    render(<ItemRow item={item()} labels={LABELS} onEdit={vi.fn()} onDelete={vi.fn()} onToggleAvailability={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Mover para cima' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mover para baixo' })).toBeDisabled();
  });
});
