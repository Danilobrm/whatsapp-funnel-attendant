import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { displayCart } from '../../lib/cartPricing.ts';
import { renderWithProviders, screen, within } from '../../test/render.tsx';
import CartSheet from './CartSheet.tsx';
import { MENU } from './fixtures.test-util.ts';

import type { CartLine } from '../../api/publicMenu/publicMenu.ts';
import type { ConfirmFailure } from '../../hooks/usePublicMenu/usePublicMenu.ts';

const PIZZA_LINE: CartLine = {
  itemId: 10,
  sizeId: 102,
  optionIds: [2001, 2003, 2102],
  quantity: 2,
  notes: 'bem assada',
};
const COCA_LINE: CartLine = {
  itemId: 30,
  sizeId: null,
  optionIds: [],
  quantity: 1,
  notes: null,
};
const SUCO_LINE: CartLine = {
  itemId: 31,
  sizeId: null,
  optionIds: [],
  quantity: 1,
  notes: null,
};

const handlers = {
  onQuantity: vi.fn(),
  onRemove: vi.fn(),
  onConfirm: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.resetAllMocks();
});

function open(
  lines: CartLine[],
  over: {
    minOrderCents?: number;
    confirming?: boolean;
    failure?: ConfirmFailure | null;
  } = {},
) {
  return renderWithProviders(
    <CartSheet
      cart={displayCart(MENU, lines)}
      minOrderCents={over.minOrderCents ?? 0}
      confirming={over.confirming ?? false}
      failure={over.failure ?? null}
      {...handlers}
    />,
  );
}

const confirmButton = () =>
  screen.getByRole('button', { name: /Confirmar itens|Enviando/ });

describe('CartSheet', () => {
  it('lists each line with size, options, notes and its total, plus the subtotal', () => {
    open([PIZZA_LINE, COCA_LINE]);

    expect(screen.getByText('Pizza Grande')).toBeInTheDocument();
    expect(
      screen.getByText('Calabresa · Quatro Queijos · Catupiry'),
    ).toBeInTheDocument();
    expect(screen.getByText('bem assada')).toBeInTheDocument();
    expect(screen.getByText('R$ 137,00')).toBeInTheDocument(); // 2 × 68,50
    const subtotal = screen.getByText('Subtotal').closest('div')!;
    expect(within(subtotal).getByText('R$ 149,00')).toBeInTheDocument();
  });

  it('says the delivery, address and payment are arranged on WhatsApp', () => {
    open([COCA_LINE]);

    expect(
      screen.getByText(
        'Entrega, endereço e pagamento você combina no WhatsApp.',
      ),
    ).toBeInTheDocument();
  });

  it('confirms with the button', async () => {
    open([COCA_LINE]);

    await userEvent.click(confirmButton());

    expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('changes the quantity and removes a line', async () => {
    open([COCA_LINE]);

    await userEvent.click(screen.getByRole('button', { name: 'Mais um' }));
    expect(handlers.onQuantity).toHaveBeenCalledWith(0, 2);

    await userEvent.click(screen.getByRole('button', { name: 'Menos um' }));
    expect(handlers.onQuantity).toHaveBeenLastCalledWith(0, 0); // zerar remove a linha

    await userEvent.click(
      screen.getByRole('button', { name: 'Remover Coca 2L' }),
    );
    expect(handlers.onRemove).toHaveBeenCalledWith(0);
  });

  it('an empty cart says so and cannot be confirmed', () => {
    open([]);

    expect(screen.getByText('Seu carrinho está vazio.')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it('shows the minimum order and blocks confirming below it', () => {
    open([COCA_LINE], { minOrderCents: 2000 });

    expect(
      screen.getByText('Pedido mínimo de R$ 20,00, sem a taxa de entrega.'),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it('allows confirming at exactly the minimum', () => {
    open([COCA_LINE], { minOrderCents: 1200 });

    expect(confirmButton()).toBeEnabled();
  });

  it('shows "Enviando..." and blocks a double click while confirming', () => {
    open([COCA_LINE], { confirming: true });

    expect(confirmButton()).toHaveTextContent('Enviando...');
    expect(confirmButton()).toBeDisabled();
  });

  // Item que esgotou depois de adicionado: fica visível, avisado, e trava o envio.
  it('flags a line whose item sold out, blocks confirming and lets the customer remove it', async () => {
    open([COCA_LINE, SUCO_LINE]);

    expect(
      screen.getByText(
        'Este item não está mais disponível. Remova para continuar.',
      ),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Remover Esgotado' }),
    );
    expect(handlers.onRemove).toHaveBeenCalledWith(1);
  });

  it('a cart with ONLY unavailable lines is not "empty" and cannot be confirmed', () => {
    open([SUCO_LINE]);

    expect(
      screen.queryByText('Seu carrinho está vazio.'),
    ).not.toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });
});

describe('CartSheet — erros do servidor (por code, nunca por message)', () => {
  it('translates the failure code', () => {
    open([COCA_LINE], { failure: { code: 'rate_limited', problems: [] } });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Muitas tentativas. Espere um instante e tente de novo.',
    );
  });

  it('falls back to the generic text for an unknown code', () => {
    open([COCA_LINE], { failure: { code: 'novo_code', problems: [] } });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Algo deu errado. Tente novamente.',
    );
    expect(screen.queryByText(/publicMenu\.errors/)).not.toBeInTheDocument();
  });

  it('shows each line problem under THAT line', () => {
    open([PIZZA_LINE, COCA_LINE], {
      failure: {
        code: 'cart_invalid',
        problems: [{ code: 'size_required', lineIndex: 1 }],
      },
    });

    const cocaRow = screen.getByText('Coca 2L').closest('li')!;
    expect(
      within(cocaRow).getByText('Falta escolher o tamanho.'),
    ).toBeInTheDocument();
    const pizzaRow = screen.getByText('Pizza Grande').closest('li')!;
    expect(
      within(pizzaRow).queryByText('Falta escolher o tamanho.'),
    ).not.toBeInTheDocument();
  });

  it('a problem code the page does not know falls back to the generic cart message', () => {
    open([COCA_LINE], {
      failure: {
        code: 'cart_invalid',
        problems: [{ code: 'algo_novo', lineIndex: 0 }],
      },
    });

    const row = screen.getByText('Coca 2L').closest('li')!;
    expect(
      within(row).getByText(/Alguns itens não puderam ser confirmados/),
    ).toBeInTheDocument();
  });
});
