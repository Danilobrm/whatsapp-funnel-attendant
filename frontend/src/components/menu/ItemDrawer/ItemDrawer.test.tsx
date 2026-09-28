import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';
import ItemDrawer from './ItemDrawer.tsx';

import type { MenuCategory, MenuItem } from '../../../api/menu';

const CATEGORIES: MenuCategory[] = [
  { id: 1, name: 'Pizzas', position: 0, active: true, items: [] },
  { id: 2, name: 'Bebidas', position: 1, active: true, items: [] },
];

function renderDrawer(overrides: Partial<Parameters<typeof ItemDrawer>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  renderWithProviders(
    <ItemDrawer
      open
      categories={CATEGORIES}
      item={null}
      defaultCategoryId={1}
      onClose={onClose}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onSave, onClose };
}

describe('ItemDrawer — creating an item', () => {
  it('saves with a single price by default', async () => {
    const { onSave } = renderDrawer();

    await userEvent.type(screen.getByLabelText('Nome'), 'Calabresa');
    await userEvent.type(screen.getByLabelText('Preço'), '45,00');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 1,
        name: 'Calabresa',
        priceCents: 4500,
        sizes: [],
        optionGroups: [],
      }),
    );
  });

  it('switches to sizes and sends them instead of a single price', async () => {
    const { onSave } = renderDrawer();

    await userEvent.type(screen.getByLabelText('Nome'), 'Calabresa');
    await userEvent.click(screen.getByRole('button', { name: 'Por tamanho' }));
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar tamanho' }));
    await userEvent.type(screen.getByLabelText('Nome do tamanho'), 'Grande');
    await userEvent.type(screen.getAllByLabelText('Preço')[0]!, '58,00');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        priceCents: null,
        sizes: [{ name: 'Grande', priceCents: 5800, position: 0 }],
      }),
    );
  });

  it('adds an option group with an option', async () => {
    const { onSave } = renderDrawer();

    await userEvent.type(screen.getByLabelText('Nome'), 'X-Burger');
    await userEvent.type(screen.getByLabelText('Preço'), '18,00');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar grupo' }));
    await userEvent.type(screen.getByLabelText('Nome do grupo'), 'Adicionais');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar opção' }));
    await userEvent.type(screen.getByLabelText('Nome da opção'), 'Bacon');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        optionGroups: [
          expect.objectContaining({
            name: 'Adicionais',
            minSelect: 0,
            maxSelect: 1,
            pricingRule: 'sum',
            options: [
              expect.objectContaining({ name: 'Bacon', priceCents: 0 }),
            ],
          }),
        ],
      }),
    );
  });

  it('shows the translated error when saving is rejected', async () => {
    const onSave = vi.fn().mockRejectedValue({ code: 'name_required' });
    renderDrawer({ onSave });

    await userEvent.type(screen.getByLabelText('Preço'), '10,00');
    await userEvent.type(screen.getByLabelText('Nome'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Preencha o nome.')).toBeInTheDocument();
  });
});

describe('ItemDrawer — editing an item', () => {
  const ITEM: MenuItem = {
    id: 9,
    categoryId: 2,
    name: 'Suco Natural',
    description: 'Polpa de fruta',
    priceCents: 900,
    imageUrl: null,
    available: true,
    active: true,
    position: 0,
    sizes: [],
    optionGroups: [],
  };

  it('pre-fills the form from the existing item', () => {
    renderDrawer({ item: ITEM });

    expect(screen.getByDisplayValue('Suco Natural')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Polpa de fruta')).toBeInTheDocument();
    expect(screen.getByLabelText('Preço')).toHaveValue('9,00');
  });
});
