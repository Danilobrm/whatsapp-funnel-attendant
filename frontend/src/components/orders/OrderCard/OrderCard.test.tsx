import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';
import OrderCard from './OrderCard.tsx';

import type { Order } from '../../../api/orders/orders.ts';

const NOW = Date.parse('2026-09-29T20:00:00.000Z');

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    number: 42,
    conversationId: null,
    customerName: 'Ana Souza',
    customerPhone: null,
    status: 'pending',
    fulfillment: 'delivery',
    address: null,
    neighborhood: 'Centro',
    paymentMethod: 'pix',
    changeForCents: null,
    subtotalCents: 4500,
    feeCents: 500,
    totalCents: 5000,
    notes: null,
    rejectReason: null,
    rejectNote: null,
    createdAt: new Date(NOW - 2 * 60_000).toISOString(),
    acceptedAt: null,
    readyAt: null,
    completedAt: null,
    updatedAt: new Date(NOW).toISOString(),
    items: [
      {
        name: 'Pizza Calabresa',
        sizeName: 'Grande',
        unitPriceCents: 4500,
        quantity: 1,
        options: [],
        notes: null,
      },
    ],
    ...overrides,
  };
}

function renderCard(
  o: Order,
  handlers: Partial<
    Record<'onOpen' | 'onAdvance' | 'onReject', ReturnType<typeof vi.fn>>
  > = {},
) {
  const props = {
    onOpen: vi.fn(),
    onAdvance: vi.fn(),
    onReject: vi.fn(),
    ...handlers,
  };
  renderWithProviders(<OrderCard order={o} now={NOW} {...props} />);
  return props;
}

describe('OrderCard', () => {
  it('shows number, customer, items, total and elapsed time', () => {
    renderCard(order());
    expect(screen.getByRole('button', { name: '#42' })).toBeInTheDocument();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('1× Pizza Calabresa')).toBeInTheDocument();
    expect(screen.getByText('R$ 50,00')).toBeInTheDocument();
    expect(screen.getByText('há 2 min')).toBeInTheDocument();
    expect(screen.getByText('Entrega')).toBeInTheDocument();
  });

  it('new order: accept advances to accepted, reject opens the dialog', async () => {
    const props = renderCard(order());

    await userEvent.click(screen.getByRole('button', { name: 'Aceitar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Recusar' }));

    expect(props.onAdvance).toHaveBeenCalledWith('accepted');
    expect(props.onReject).toHaveBeenCalled();
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('accepted delivery order goes out for delivery; pickup goes ready', async () => {
    const delivery = renderCard(order({ status: 'accepted' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Saiu para entrega' }),
    );
    expect(delivery.onAdvance).toHaveBeenCalledWith('out_for_delivery');
    expect(
      screen.queryByRole('button', { name: 'Recusar' }),
    ).not.toBeInTheDocument();
  });

  it('accepted pickup order becomes ready for pickup', async () => {
    const pickup = renderCard(
      order({ status: 'accepted', fulfillment: 'pickup' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Pronto para retirada' }),
    );
    expect(pickup.onAdvance).toHaveBeenCalledWith('ready_for_pickup');
  });

  it('turns red when a new order waits more than 5 minutes', () => {
    renderCard(order({ createdAt: new Date(NOW - 7 * 60_000).toISOString() }));
    expect(screen.getByRole('article')).toHaveAttribute('data-late', 'true');
    expect(screen.getByText('há 7 min')).toHaveClass('text-danger');
  });

  it('finished orders show the status badge and no actions', () => {
    renderCard(order({ status: 'rejected' }));
    expect(screen.getByText('Recusado')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Aceitar' }),
    ).not.toBeInTheDocument();
  });

  it('clicking the card opens the detail', async () => {
    const props = renderCard(order());
    await userEvent.click(screen.getByText('Ana Souza'));
    expect(props.onOpen).toHaveBeenCalled();
  });
});
