import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '../../../test/render.tsx';
import CategoryChips from './CategoryChips.tsx';

const LABELS = {
  all: 'Todos',
  item: 'item',
  items: 'itens',
  newPlaceholder: 'Nova categoria',
  add: 'Adicionar',
  addLabel: 'Adicionar categoria',
};

const CATEGORIES = [
  { id: 1, name: 'Pizzas', count: 5, active: true },
  { id: 2, name: 'Bebidas', count: 1, active: false },
];

function Harness({
  onAdd = vi.fn(),
  onSelect = vi.fn(),
}: {
  onAdd?: () => void;
  onSelect?: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <CategoryChips
      categories={CATEGORIES}
      totalCount={6}
      selected={1}
      onSelect={onSelect}
      newName={name}
      onNewNameChange={setName}
      onAdd={onAdd}
      labels={LABELS}
    />
  );
}

describe('CategoryChips', () => {
  it('renders "Todos" with the total and each category with its count', () => {
    render(<Harness />);

    expect(
      screen.getByRole('button', { name: 'Todos 6 itens' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pizzas 5 itens' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Bebidas 1 item' }),
    ).toBeInTheDocument();
  });

  it('marks only the selected chip as pressed', () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: /Pizzas/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Todos/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('calls onSelect with the category id or "all"', async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /Bebidas/ }));
    await userEvent.click(screen.getByRole('button', { name: /Todos/ }));
    expect(onSelect).toHaveBeenNthCalledWith(1, 2);
    expect(onSelect).toHaveBeenNthCalledWith(2, 'all');
  });

  it('shows the add chip last, and opens an input that submits the name', async () => {
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);

    const add = screen.getByRole('button', { name: 'Adicionar categoria' });
    const chips = screen.getAllByRole('button');
    expect(chips[chips.length - 1]).toBe(add);

    await userEvent.click(add);
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeDisabled();
    await userEvent.type(
      screen.getByPlaceholderText('Nova categoria'),
      'Doces{Enter}',
    );
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Adicionar categoria' }),
    ).toBeInTheDocument();
  });
});
