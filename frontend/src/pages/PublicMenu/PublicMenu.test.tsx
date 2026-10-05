import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/publicMenu/publicMenu.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/publicMenu/publicMenu.ts')>();
  return { ...actual, fetchPublicMenu: vi.fn(), confirmPublicCart: vi.fn() };
});

const api = await import('../../api/publicMenu/publicMenu.ts');
const { renderWithProviders, screen, within } =
  await import('../../test/render.tsx');
const { default: PublicMenu } = await import('./PublicMenu.tsx');
const { view } =
  await import('../../components/publicMenu/fixtures.test-util.ts');

const fetchMenu = vi.mocked(api.fetchPublicMenu);
const confirmCart = vi.mocked(api.confirmPublicCart);

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/c/:token" element={<PublicMenu />} />
    </Routes>,
    { route: '/c/tok.en.sig' },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  fetchMenu.mockResolvedValue(view());
});

async function addCoca() {
  await userEvent.click(await screen.findByRole('button', { name: /Coca 2L/ }));
  await userEvent.click(screen.getByRole('button', { name: /^Adicionar/ }));
}

describe('PublicMenu — carga', () => {
  it('reads the token from the URL', async () => {
    renderPage();

    await screen.findByText('Pizzaria do Zé');
    expect(fetchMenu).toHaveBeenCalledWith('tok.en.sig');
  });

  it('keeps the page frame and shows item skeletons while loading', () => {
    fetchMenu.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getAllByTestId('public-item-skeleton')).toHaveLength(4);
    // Cabeçalho existe, com esqueleto só no nome/logo — o quadro da página fica.
    expect(
      document.querySelectorAll('header [aria-busy="true"]').length,
    ).toBeGreaterThan(0);
  });

  it('shows the restaurant, its open state in text, categories and items', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Pizzaria do Zé' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Aberto');
    expect(screen.getByRole('heading', { name: 'Pizzas' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Lanches' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /X-Burger/ }),
    ).toBeInTheDocument();
  });

  it('says when the store is closed and when it opens (in the store timezone)', async () => {
    fetchMenu.mockResolvedValue(
      view({
        restaurant: {
          ...view().restaurant,
          open: false,
          // quarta 11:00 em São Paulo
          nextOpening: '2026-09-30T14:00:00.000Z',
        },
      }),
    );
    renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent(
      /Fechado · abre .*11:00/,
    );
  });

  it('says a paused store is closed right now', async () => {
    fetchMenu.mockResolvedValue(
      view({ restaurant: { ...view().restaurant, open: false, paused: true } }),
    );
    renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Fechado no momento',
    );
  });

  it('a closed store still lets the customer browse and build the cart', async () => {
    fetchMenu.mockResolvedValue(
      view({
        restaurant: { ...view().restaurant, open: false, nextOpening: null },
      }),
    );
    renderPage();

    await addCoca();

    expect(
      screen.getByRole('button', { name: /Ver carrinho/ }),
    ).toBeInTheDocument();
  });

  it('says when there is nothing on the menu', async () => {
    fetchMenu.mockResolvedValue(view({ menu: [] }));
    renderPage();

    expect(
      await screen.findByText('Nenhum item disponível no cardápio agora.'),
    ).toBeInTheDocument();
  });
});

describe('PublicMenu — links inválidos', () => {
  it.each([
    ['invalid_menu_link', 'Este link não é válido. Peça um novo no WhatsApp.'],
    ['expired_menu_link', 'Este link expirou. Peça um novo no WhatsApp.'],
  ])('a %s ends in a clear message, without the menu', async (code, text) => {
    fetchMenu.mockRejectedValue(new api.PublicMenuError(401, code));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(
      screen.getByRole('heading', {
        name: 'Não foi possível abrir o cardápio',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Coca 2L/ }),
    ).not.toBeInTheDocument();
  });

  it('a network failure says the menu could not be loaded (never the raw message)', async () => {
    fetchMenu.mockRejectedValue(new Error('HTTP 500'));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Algo deu errado. Tente novamente.');
    expect(alert).not.toHaveTextContent('HTTP 500');
  });
});

describe('PublicMenu — categorias', () => {
  it('filters the list by category and back to all', async () => {
    renderPage();
    await screen.findByRole('button', { name: /X-Burger/ });

    await userEvent.click(screen.getByRole('button', { name: 'Bebidas' }));

    expect(screen.getByRole('button', { name: /Coca 2L/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /X-Burger/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bebidas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Tudo' }));
    expect(
      screen.getByRole('button', { name: /X-Burger/ }),
    ).toBeInTheDocument();
  });
});

describe('PublicMenu — carrinho', () => {
  it('adding an item shows the cart bar with the count and subtotal', async () => {
    renderPage();

    expect(
      screen.queryByRole('button', { name: /Ver carrinho/ }),
    ).not.toBeInTheDocument();
    await addCoca();

    const bar = await screen.findByRole('button', { name: /Ver carrinho/ });
    expect(bar).toHaveTextContent('1 item');
    expect(bar).toHaveTextContent('R$ 12,00');
  });

  it('the bar counts UNITS (2 lines: 1 + 2 = 3 itens)', async () => {
    renderPage();
    await addCoca();
    await userEvent.click(screen.getByRole('button', { name: /Coca 2L/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Mais um' }));
    await userEvent.type(screen.getByLabelText('Observação'), 'gelada');
    await userEvent.click(screen.getByRole('button', { name: /^Adicionar/ }));

    expect(
      screen.getByRole('button', { name: /Ver carrinho/ }),
    ).toHaveTextContent('3 itens');
  });

  it('builds the half-and-half pizza with border and the live total reaches the cart', async () => {
    renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: /Pizza tradicional/ }),
    );
    await userEvent.click(screen.getByRole('radio', { name: /Grande/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Calabresa/ }));
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Quatro Queijos/ }),
    );
    await userEvent.click(screen.getByRole('radio', { name: /Catupiry/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Adicionar/ }));

    expect(
      screen.getByRole('button', { name: /Ver carrinho/ }),
    ).toHaveTextContent('R$ 68,50');
  });

  it('starts with the cart already saved in the conversation (reopening the link resumes)', async () => {
    fetchMenu.mockResolvedValue(
      view({
        cart: {
          items: [
            {
              itemId: 30,
              sizeId: null,
              optionIds: [],
              quantity: 2,
              notes: null,
            },
          ],
        },
      }),
    );
    renderPage();

    expect(
      await screen.findByRole('button', { name: /Ver carrinho/ }),
    ).toHaveTextContent('2 itens');
  });

  it('opens the cart, and closing it brings the bar back', async () => {
    renderPage();
    await addCoca();

    await userEvent.click(screen.getByRole('button', { name: /Ver carrinho/ }));
    const cart = screen.getByRole('dialog', { name: 'Seu carrinho' });
    expect(within(cart).getByText('Coca 2L')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Ver carrinho/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Fechar carrinho' }),
    );
    expect(
      screen.getByRole('button', { name: /Ver carrinho/ }),
    ).toBeInTheDocument();
  });
});

describe('PublicMenu — confirmar', () => {
  const CONFIRMED = {
    lines: [{ name: 'Coca 2L', sizeName: null, quantity: 1, totalCents: 1200 }],
    subtotalCents: 1200,
    notified: true,
    whatsappUrl: 'https://wa.me/5561999990000?text=Montei',
  };

  async function toCart() {
    await addCoca();
    await userEvent.click(screen.getByRole('button', { name: /Ver carrinho/ }));
  }

  it('sends the ids, then shows "Carrinho enviado!" with the way back to WhatsApp', async () => {
    confirmCart.mockResolvedValue(CONFIRMED);
    renderPage();
    await toCart();

    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar itens' }),
    );

    expect(confirmCart).toHaveBeenCalledWith('tok.en.sig', [
      { itemId: 30, sizeId: null, optionIds: [], quantity: 1, notes: null },
    ]);
    expect(
      await screen.findByRole('heading', { name: 'Carrinho enviado!' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Voltar ao WhatsApp' }),
    ).toHaveAttribute('href', 'https://wa.me/5561999990000?text=Montei');
  });

  it('"Alterar itens" goes back to the menu with the cart intact', async () => {
    confirmCart.mockResolvedValue(CONFIRMED);
    renderPage();
    await toCart();
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar itens' }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Alterar itens' }),
    );

    expect(
      await screen.findByRole('button', { name: /Ver carrinho/ }),
    ).toHaveTextContent('R$ 12,00');
  });

  it('a refused cart stays in the cart with the reason, nothing is lost', async () => {
    confirmCart.mockRejectedValue(
      new api.PublicMenuError(422, 'cart_invalid', [
        { code: 'item_unavailable', lineIndex: 0 },
      ]),
    );
    renderPage();
    await toCart();

    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar itens' }),
    );

    const cart = await screen.findByRole('dialog', { name: 'Seu carrinho' });
    expect(
      await within(cart).findByText('Item indisponível.'),
    ).toBeInTheDocument();
    expect(within(cart).getByText('Coca 2L')).toBeInTheDocument();
  });

  it('a link that expires while shopping replaces the page with the expired message', async () => {
    confirmCart.mockRejectedValue(
      new api.PublicMenuError(401, 'expired_menu_link'),
    );
    renderPage();
    await toCart();

    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar itens' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este link expirou.',
    );
  });
});
