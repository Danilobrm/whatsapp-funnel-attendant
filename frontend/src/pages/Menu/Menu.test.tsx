import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen, waitFor } from '../../test/render.tsx';

vi.mock('../../api/menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/menu')>();
  return {
    ...actual,
    fetchMenu: vi.fn(),
    createCategory: vi.fn(),
    createItem: vi.fn(),
    setItemAvailability: vi.fn(),
  };
});

import {
  createCategory,
  createItem,
  fetchMenu,
  setItemAvailability,
} from '../../api/menu';

import Menu from './Menu.tsx';

const fetchMock = vi.mocked(fetchMenu);
const createCategoryMock = vi.mocked(createCategory);
const createItemMock = vi.mocked(createItem);
const setAvailabilityMock = vi.mocked(setItemAvailability);

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
  return renderWithProviders(<Menu />);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ menu: structuredClone(MENU) });
});

describe('Menu — loading', () => {
  it('shows the page title while the skeleton is up', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText('Cardápio')).toBeInTheDocument();
    expect(screen.getByTestId('menu-skeleton')).toBeInTheDocument();
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
  it('renders the category and its item with the price', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('Pizzas')).toBeInTheDocument();
    expect(screen.getByText('Calabresa')).toBeInTheDocument();
    expect(screen.getByText('R$ 45,00')).toBeInTheDocument();
  });

  it('toggles item availability', async () => {
    renderPage();
    await screen.findByText('Calabresa');

    await userEvent.click(screen.getByRole('switch', { name: 'Disponível' }));

    expect(setAvailabilityMock).toHaveBeenCalledWith(10, false);
  });

  it('adds a new category', async () => {
    createCategoryMock.mockResolvedValue({
      category: { id: 2, name: 'Bebidas', position: 1, active: true, items: [] },
    });
    renderPage();
    await screen.findByDisplayValue('Pizzas');

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

  it('opens the drawer and creates an item', async () => {
    createItemMock.mockResolvedValue({
      item: { ...MENU[0]!.items[0]!, id: 11, name: 'Marguerita' },
    });
    renderPage();
    await screen.findByText('Calabresa');

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
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
