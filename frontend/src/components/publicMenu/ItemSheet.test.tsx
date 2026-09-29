import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../test/render.tsx';
import ItemSheet from './ItemSheet.tsx';
import { MENU } from './fixtures.test-util.ts';

const PIZZA = MENU[0]!.items[0]!;
const BURGER = MENU[1]!.items[0]!;
const COCA = MENU[2]!.items[0]!;
const SUCO = MENU[2]!.items[1]!;

const onAdd = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
});

function open(item = PIZZA) {
  return renderWithProviders(
    <ItemSheet item={item} onAdd={onAdd} onClose={onClose} />,
  );
}

const addButton = () => screen.getByRole('button', { name: /^Adicionar/ });

describe('ItemSheet — pizza meio a meio', () => {
  it('is a modal dialog named after the item', () => {
    open();

    expect(screen.getByRole('dialog', { name: 'Pizza' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
  });

  it('disables "Adicionar" and says what is missing, in text', () => {
    open();

    expect(addButton()).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Escolha o tamanho');
  });

  it('after a size, still asks for the two flavors', async () => {
    open();

    await userEvent.click(screen.getByRole('radio', { name: /Grande/ }));

    expect(addButton()).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Faltam 2 em Sabores');
  });

  it('shows the live price: size + average of the flavors + border (R$ 68,50)', async () => {
    open();

    await userEvent.click(screen.getByRole('radio', { name: /Grande/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Calabresa/ }));
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Quatro Queijos/ }),
    );
    await userEvent.click(screen.getByRole('radio', { name: /Catupiry/ }));

    // 5800 + média(0, 500)=250 + 800
    expect(addButton()).toHaveTextContent('Adicionar · R$ 68,50');
    expect(addButton()).toBeEnabled();
  });

  it('with the third flavor blocked once two are chosen (max 2), until one is unchecked', async () => {
    open();
    await userEvent.click(screen.getByRole('checkbox', { name: /Calabresa/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Marguerita/ }));

    const third = screen.getByRole('checkbox', { name: /Quatro Queijos/ });
    expect(third).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: /Marguerita/ }));
    expect(third).toBeEnabled();
  });

  it('shows the pricing rule of the flavor group and how many were chosen', async () => {
    open();

    expect(
      screen.getByText('O preço é a média dos sabores escolhidos.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Obrigatório · Escolha 2 · 0 de 2/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Calabresa/ }));
    expect(screen.getByText(/1 de 2/)).toBeInTheDocument();
  });

  it('a sold-out option is disabled and labelled', () => {
    open();

    const sold = screen.getByRole('checkbox', { name: /Sabor Esgotado/ });
    expect(sold).toBeDisabled();
    expect(sold).toHaveTextContent('Esgotado');
  });

  it('a single-choice group (border) swaps the option instead of stacking', async () => {
    open();

    await userEvent.click(screen.getByRole('radio', { name: /Catupiry/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Sem borda/ }));

    expect(screen.getByRole('radio', { name: /Sem borda/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: /Catupiry/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('hands the line (ids only, no prices) to onAdd and closes', async () => {
    open();
    await userEvent.click(screen.getByRole('radio', { name: /Grande/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Calabresa/ }));
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Quatro Queijos/ }),
    );
    await userEvent.click(screen.getByRole('radio', { name: /Catupiry/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Mais um' }));
    await userEvent.type(screen.getByLabelText('Observação'), '  bem assada ');

    await userEvent.click(addButton());

    expect(onAdd).toHaveBeenCalledTimes(1);
    const line = onAdd.mock.calls[0]?.[0];
    expect(line).toEqual({
      itemId: 10,
      sizeId: 102,
      optionIds: expect.arrayContaining([2001, 2003, 2102]),
      quantity: 2,
      notes: 'bem assada',
    });
    expect(line.optionIds).toHaveLength(3);
    expect(onClose).toHaveBeenCalled();
  });

  it('multiplies the price by the quantity', async () => {
    open();
    await userEvent.click(screen.getByRole('radio', { name: /Média/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Calabresa/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Marguerita/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Mais um' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mais um' }));

    expect(addButton()).toHaveTextContent('Adicionar · R$ 135,00');
  });

  it('quantity never goes below 1', async () => {
    open();

    expect(screen.getByRole('button', { name: 'Menos um' })).toBeDisabled();
  });

  it('sends null notes when the note is empty or blank', async () => {
    open(COCA);

    await userEvent.type(screen.getByLabelText('Observação'), '   ');
    await userEvent.click(addButton());

    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({
      itemId: 30,
      sizeId: null,
      notes: null,
    });
  });
});

describe('ItemSheet — outros itens', () => {
  it('an item without sizes or required options can be added right away', () => {
    open(COCA);

    expect(addButton()).toBeEnabled();
    expect(addButton()).toHaveTextContent('Adicionar · R$ 12,00');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('add-ons are optional and add to the price', async () => {
    open(BURGER);
    expect(screen.getByText(/Opcional · até 3/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Bacon/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Ovo/ }));

    expect(addButton()).toHaveTextContent('Adicionar · R$ 25,00');
  });

  // Não chega aqui pelo cartão (desabilitado), mas o carrinho antigo pode reabrir.
  it('a sold-out item cannot be added and says so', () => {
    open(SUCO);

    expect(addButton()).toBeDisabled();
    expect(screen.getByText('Este item está esgotado.')).toBeInTheDocument();
  });
});

describe('ItemSheet — fechar', () => {
  it('closes with the button, with Escape and by clicking outside', async () => {
    const { container } = open(COCA);

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      container.querySelector('[aria-hidden="true"].absolute')!,
    );

    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('moves focus to the close button on open', () => {
    open(COCA);

    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
  });
});
