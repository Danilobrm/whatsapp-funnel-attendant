import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen, within } from '../../test/render.tsx';
import DebugPanel from './DebugPanel.tsx';

import type { SimulatorCart } from '../../api/simulator/simulator.ts';

const CART: SimulatorCart = {
  status: 'open',
  lines: [
    {
      number: 1,
      name: 'Pizza',
      size: 'Grande',
      options: ['Sabores: Calabresa', 'Sabores: Quatro Queijos'],
      quantity: 2,
      unitPriceCents: 6850,
      totalCents: 13700,
      notes: 'bem assada',
    },
  ],
  subtotalCents: 13700,
  feeCents: 500,
  totalCents: 14200,
  fulfillment: 'delivery',
  address: 'Rua das Flores, 12 - Centro',
  payment: 'Dinheiro',
  changeFor: 'R$ 200,00',
  notes: null,
  pending: [],
};

describe('DebugPanel — carrinho', () => {
  it('shows lines, options, notes and money formatted from cents', () => {
    renderWithProviders(
      <DebugPanel cart={CART} toolCalls={[]} loading={false} />,
    );

    expect(screen.getByText(/2x Pizza Grande/)).toBeInTheDocument();
    // linha e subtotal
    expect(screen.getAllByText('R$ 137,00')).toHaveLength(2);
    expect(
      screen.getByText('Sabores: Calabresa · Sabores: Quatro Queijos'),
    ).toBeInTheDocument();
    expect(screen.getByText('bem assada')).toBeInTheDocument();
    expect(screen.getByText('R$ 5,00')).toBeInTheDocument(); // taxa
    expect(screen.getByText('R$ 142,00')).toBeInTheDocument(); // total
  });

  it('shows delivery address, payment and change', () => {
    renderWithProviders(
      <DebugPanel cart={CART} toolCalls={[]} loading={false} />,
    );

    expect(
      screen.getByText('Entrega: Rua das Flores, 12 - Centro'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Pagamento: Dinheiro (Troco para R$ 200,00)'),
    ).toBeInTheDocument();
  });

  it('labels the cart status in words', () => {
    const { rerender } = renderWithProviders(
      <DebugPanel cart={CART} toolCalls={[]} loading={false} />,
    );
    expect(screen.getByText('Montando')).toBeInTheDocument();

    rerender(
      <DebugPanel
        cart={{ ...CART, status: 'awaiting_confirmation' }}
        toolCalls={[]}
        loading={false}
      />,
    );
    expect(screen.getByText('Aguardando confirmação')).toBeInTheDocument();
  });

  it('hides the fee line for pickup and says pickup', () => {
    renderWithProviders(
      <DebugPanel
        cart={{ ...CART, fulfillment: 'pickup', address: null, feeCents: 0 }}
        toolCalls={[]}
        loading={false}
      />,
    );

    expect(screen.queryByText('Taxa de entrega')).not.toBeInTheDocument();
    expect(screen.getByText('Retirada')).toBeInTheDocument();
  });

  it('says what is not set yet, and lists what is missing to close', () => {
    renderWithProviders(
      <DebugPanel
        cart={{
          ...CART,
          fulfillment: null,
          address: null,
          payment: null,
          changeFor: null,
          pending: ['falta a forma de pagamento'],
        }}
        toolCalls={[]}
        loading={false}
      />,
    );

    expect(
      screen.getByText('Entrega ou retirada: não definido'),
    ).toBeInTheDocument();
    expect(screen.getByText('Falta para fechar')).toBeInTheDocument();
    expect(screen.getByText('falta a forma de pagamento')).toBeInTheDocument();
  });

  it('says the cart is empty when there is none', () => {
    renderWithProviders(
      <DebugPanel cart={null} toolCalls={[]} loading={false} />,
    );

    expect(screen.getByText('Carrinho vazio.')).toBeInTheDocument();
  });

  // Regra de skeleton: o esqueleto fica NO carrinho; o painel e os títulos ficam.
  it('renders a skeleton in the cart only, keeping titles visible, while loading', () => {
    renderWithProviders(<DebugPanel cart={null} toolCalls={[]} loading />);

    expect(
      screen.getByRole('heading', { name: 'Carrinho' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Ferramentas chamadas neste turno' }),
    ).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('Carrinho vazio.')).not.toBeInTheDocument();
  });
});

describe('DebugPanel — ferramentas', () => {
  it('says when the turn had no tool calls', () => {
    renderWithProviders(
      <DebugPanel cart={null} toolCalls={[]} loading={false} />,
    );

    expect(
      screen.getByText('Nenhuma ferramenta neste turno.'),
    ).toBeInTheDocument();
  });

  it('marks a successful call "ok" and a refused one with its error code, in text', () => {
    renderWithProviders(
      <DebugPanel
        cart={null}
        loading={false}
        toolCalls={[
          {
            name: 'search_menu',
            args: { query: 'pizza' },
            result: { ok: true },
          },
          {
            name: 'add_item',
            args: { item_id: 10 },
            result: { ok: false, error: 'item_incomplete' },
          },
        ]}
      />,
    );

    const items = screen
      .getAllByRole('listitem')
      .filter((li) => li.querySelector('details'));
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('search_menu')).toBeInTheDocument();
    expect(within(items[0]!).getByText('ok')).toBeInTheDocument();
    expect(within(items[1]!).getByText('add_item')).toBeInTheDocument();
    expect(
      within(items[1]!).getByText('recusada: item_incomplete'),
    ).toBeInTheDocument();
  });

  it('reveals the arguments and the result as JSON on demand', async () => {
    renderWithProviders(
      <DebugPanel
        cart={null}
        loading={false}
        toolCalls={[
          {
            name: 'add_item',
            args: { item_id: 10 },
            result: { ok: false, error: 'item_incomplete' },
          },
        ]}
      />,
    );

    await userEvent.click(screen.getByText('add_item'));

    expect(screen.getByText(/"item_id": 10/)).toBeInTheDocument();
    expect(screen.getByText(/"error": "item_incomplete"/)).toBeInTheDocument();
  });
});
