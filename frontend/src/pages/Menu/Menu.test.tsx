import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen, waitFor } from '../../test/render.tsx';

vi.mock('../../api/menu/menu.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/menu/menu.ts')>();
  return {
    ...actual,
    fetchMenu: vi.fn(),
    createCategory: vi.fn(),
    deleteCategory: vi.fn(),
    createItem: vi.fn(),
    deleteItem: vi.fn(),
  };
});

import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  fetchMenu,
} from '../../api/menu/menu.ts';

import Menu from './Menu.tsx';

const fetchMock = vi.mocked(fetchMenu);
const createCategoryMock = vi.mocked(createCategory);
const createItemMock = vi.mocked(createItem);
const deleteCategoryMock = vi.mocked(deleteCategory);
const deleteItemMock = vi.mocked(deleteItem);

const MENU = [
  {
    id: 1,
    name: 'Pizzas',
    position: 0,
    active: true,
    items: [
      {
        id: 10,
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
      },
    ],
  },
];

function renderPage() {
  return renderWithProviders(<Menu />, { route: '/admin/store/menu' });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ menu: structuredClone(MENU) });
});

describe('Menu — loading', () => {
  it('shows the page title while the skeleton is up', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Cardápio' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('menu-skeleton')).toBeInTheDocument();
  });

  it('is its own page: no Loja tabs on top', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Cardápio' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Geral' }),
    ).not.toBeInTheDocument();
  });

  it('shows an error when the menu cannot be loaded', async () => {
    fetchMock.mockRejectedValue(new Error('HTTP 500'));
    renderPage();

    expect(
      await screen.findByText('Não foi possível carregar o cardápio.'),
    ).toBeInTheDocument();
  });
});

describe('Menu — categories and items', () => {
  it('shows every item under "Todos" and the chips', async () => {
    renderPage();

    expect(await screen.findByText('Calabresa')).toBeInTheDocument();
    expect(screen.getByText('R$ 45,00')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Todos 1 item' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Pizzas 1 item' }),
    ).toBeInTheDocument();
    // Sem categoria selecionada não há barra de edição.
    expect(
      screen.queryByLabelText('Nome da categoria'),
    ).not.toBeInTheDocument();
  });

  it('selecting a category chip shows its toolbar and filters the grid', async () => {
    fetchMock.mockResolvedValue({
      menu: [
        ...structuredClone(MENU),
        {
          id: 2,
          name: 'Bebidas',
          position: 1,
          active: true,
          items: [
            { ...MENU[0]!.items[0]!, id: 20, categoryId: 2, name: 'Guaraná' },
          ],
        },
      ],
    });
    renderPage();
    await screen.findByText('Guaraná');

    await userEvent.click(screen.getByRole('button', { name: /^Bebidas/ }));

    expect(screen.getByDisplayValue('Bebidas')).toBeInTheDocument();
    expect(screen.getByText('Guaraná')).toBeInTheDocument();
    expect(screen.queryByText('Calabresa')).not.toBeInTheDocument();
  });

  it('shows the empty-category message when a category has no items', async () => {
    fetchMock.mockResolvedValue({
      menu: [{ id: 2, name: 'Bebidas', position: 0, active: true, items: [] }],
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /^Bebidas/ }),
    );
    expect(
      screen.getByText('Nenhum item nesta categoria ainda.'),
    ).toBeInTheDocument();
  });

  it('shows the empty-menu message when there are no categories', async () => {
    fetchMock.mockResolvedValue({ menu: [] });
    renderPage();

    expect(
      await screen.findByText(
        'Nenhuma categoria ainda. Crie a primeira acima.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Adicionar item' }),
    ).not.toBeInTheDocument();
  });

  it('goes back to "Todos" after deleting the selected category', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteCategoryMock.mockResolvedValue(undefined);
    renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: /^Pizzas/ }),
    );

    fetchMock.mockResolvedValue({ menu: [] });
    await userEvent.click(
      screen.getByRole('button', { name: 'Excluir categoria' }),
    );

    await waitFor(() => expect(deleteCategoryMock).toHaveBeenCalledWith(1));
    expect(
      await screen.findByRole('button', { name: 'Todos 0 itens' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('deletes an item from inside its drawer, after confirming', async () => {
    deleteItemMock.mockResolvedValue(undefined);
    renderPage();
    await userEvent.click(await screen.findByText('Calabresa'));

    await userEvent.click(screen.getByRole('button', { name: 'Excluir item' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sim, excluir' }));

    await waitFor(() => expect(deleteItemMock).toHaveBeenCalledWith(10));
  });

  it('adds a new category', async () => {
    createCategoryMock.mockResolvedValue({
      category: {
        id: 2,
        name: 'Bebidas',
        position: 1,
        active: true,
        items: [],
      },
    });
    renderPage();
    await screen.findByText('Calabresa');

    await userEvent.click(
      screen.getByRole('button', { name: 'Adicionar categoria' }),
    );
    await userEvent.type(
      screen.getByPlaceholderText('Nova categoria (ex.: Pizzas)'),
      'Bebidas',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(createCategoryMock).toHaveBeenCalledWith({
        name: 'Bebidas',
        position: 1,
        active: true,
      }),
    );
  });

  it('selects the category right after creating it', async () => {
    createCategoryMock.mockResolvedValue({
      category: {
        id: 2,
        name: 'Bebidas',
        position: 1,
        active: true,
        items: [],
      },
    });
    renderPage();
    await screen.findByText('Calabresa');

    fetchMock.mockResolvedValue({
      menu: [
        ...structuredClone(MENU),
        { id: 2, name: 'Bebidas', position: 1, active: true, items: [] },
      ],
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Adicionar categoria' }),
    );
    await userEvent.type(
      screen.getByPlaceholderText('Nova categoria (ex.: Pizzas)'),
      'Bebidas{Enter}',
    );

    expect(await screen.findByDisplayValue('Bebidas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Bebidas/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('opens the drawer and creates an item', async () => {
    createItemMock.mockResolvedValue({
      item: { ...MENU[0]!.items[0]!, id: 11, name: 'Marguerita' },
    });
    renderPage();
    await screen.findByText('Calabresa');

    await userEvent.click(
      screen.getByRole('button', { name: 'Adicionar item' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Nome'), 'Marguerita');
    await userEvent.type(screen.getByLabelText('Preço'), '50,00');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(createItemMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Marguerita', priceCents: 5000 }),
      ),
    );
  });
});
