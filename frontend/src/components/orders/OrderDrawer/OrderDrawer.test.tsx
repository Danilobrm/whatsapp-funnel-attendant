import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';
import OrderDrawer from './OrderDrawer.tsx';

import type { Order } from '../../../api/orders/orders.ts';

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    number: 42,
    conversationId: 9,
    customerName: 'Ana Souza',
    customerPhone: '5511990000001',
    status: 'pending',
    fulfillment: 'delivery',
    address: {
      street: 'Rua das Flores',
      number: '100',
      complement: null,
      reference: null,
    },
    neighborhood: 'Centro',
    paymentMethod: 'cash',
    changeForCents: 10000,
    subtotalCents: 7800,
    feeCents: 500,
    totalCents: 8300,
    notes: null,
    rejectReason: null,
    rejectNote: null,
    createdAt: '2026-09-29T20:00:00.000Z',
    acceptedAt: null,
    readyAt: null,
    completedAt: null,
    updatedAt: '2026-09-29T20:00:00.000Z',
    items: [
      {
        name: 'Pizza Calabresa',
        sizeName: 'Grande',
        unitPriceCents: 6600,
        quantity: 1,
        options: [{ group: 'Borda', name: 'Catupiry', priceCents: 800 }],
        notes: 'Bem assada',
      },
      {
        name: 'Refrigerante 2L',
        sizeName: null,
        unitPriceCents: 1200,
        quantity: 1,
        options: [],
        notes: null,
      },
    ],
    ...overrides,
  };
}

function renderDrawer(o: Order) {
  const onClose = vi.fn();
  const onCancelOrder = vi.fn();
  renderWithProviders(
    <OrderDrawer order={o} onClose={onClose} onCancelOrder={onCancelOrder} />,
    {
      route: '/admin/orders',
    },
  );
  return { onClose, onCancelOrder };
}

describe('OrderDrawer', () => {
  it('shows items with size, options and notes, totals, payment and change', () => {
    renderDrawer(order());

    expect(
      screen.getByRole('dialog', { name: 'Pedido #42' }),
    ).toBeInTheDocument();
    expect(screen.getByText('(Grande)')).toBeInTheDocument();
    expect(screen.getByText('+ Borda: Catupiry')).toBeInTheDocument();
    expect(screen.getByText('Obs.: Bem assada')).toBeInTheDocument();
    expect(screen.getByText('R$ 83,00')).toBeInTheDocument();
    expect(screen.getByText('Dinheiro')).toBeInTheDocument();
    expect(screen.getByText('R$ 100,00')).toBeInTheDocument();
    expect(
      screen.getByText('Rua das Flores, 100 — Centro'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver conversa' })).toHaveAttribute(
      'href',
      '/admin/simulator',
    );
  });

  it('cancelling asks for confirmation first', async () => {
    const { onCancelOrder } = renderDrawer(order());

    await userEvent.click(
      screen.getByRole('button', { name: 'Cancelar pedido' }),
    );
    expect(onCancelOrder).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Sim, cancelar' }),
    );
    expect(onCancelOrder).toHaveBeenCalled();
  });

  it('finished orders cannot be cancelled and show the rejection reason', () => {
    renderDrawer(order({ status: 'rejected', rejectReason: 'sold_out' }));
    expect(
      screen.queryByRole('button', { name: 'Cancelar pedido' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Item esgotado')).toBeInTheDocument();
  });

  it('closes with the X button', async () => {
    const { onClose } = renderDrawer(order());
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalled();
  });
});
