import userEvent from '@testing-library/user-event';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '../../test/render.tsx';

vi.mock('../../api/orders/orderStream.ts', () => ({
  openOrderStream: vi.fn(),
}));

vi.mock('../../api/orders/orders.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/orders/orders.ts')>();
  return {
    ...actual,
    fetchOrders: vi.fn(),
    transitionOrder: vi.fn(),
    createSampleOrder: vi.fn(),
  };
});

import {
  createSampleOrder,
  fetchOrders,
  OrderRejectedError,
  transitionOrder,
  type Order,
} from '../../api/orders/orders.ts';
import { openOrderStream } from '../../api/orders/orderStream.ts';
import Orders from './Orders.tsx';

const fetchMock = vi.mocked(fetchOrders);
const streamMock = vi.mocked(openOrderStream);
const transitionMock = vi.mocked(transitionOrder);
const sampleMock = vi.mocked(createSampleOrder);

type StreamArgs = Parameters<typeof openOrderStream>[0];
let stream: StreamArgs | null = null;

function order(id: number, overrides: Partial<Order> = {}): Order {
  return {
    id,
    number: id,
    conversationId: null,
    customerName: `Cliente ${id}`,
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
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    readyAt: null,
    completedAt: null,
    updatedAt: new Date().toISOString(),
    items: [
      {
        name: 'X-Tudo',
        sizeName: null,
        unitPriceCents: 4500,
        quantity: 1,
        options: [],
        notes: null,
      },
    ],
    ...overrides,
  };
}

function column(name: string) {
  return within(screen.getByRole('region', { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  stream = null;
  streamMock.mockImplementation((args) => {
    stream = args;
    args.onOpen?.();
    return new Promise(() => {});
  });
  fetchMock.mockResolvedValue({
    orders: [
      order(1),
      order(2, { status: 'accepted' }),
      order(3, { status: 'completed' }),
    ],
  });
});

describe('Orders page', () => {
  it('keeps the title and columns visible while loading, with card skeletons', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<Orders />, { route: '/admin/orders' });

    expect(
      screen.getByRole('heading', { name: 'Pedidos' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Novos' })).toBeInTheDocument();
    expect(screen.getAllByTestId('order-card-skeleton').length).toBeGreaterThan(
      0,
    );
  });

  it('mobile tabs show the count per column and switch the selected one', async () => {
    renderWithProviders(<Orders />, { route: '/admin/orders' });
    await column('Novos').findByText('Cliente 1');

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveTextContent('1');

    await userEvent.click(screen.getByRole('tab', { name: /Em preparo/ }));
    expect(screen.getByRole('tab', { name: /Em preparo/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('places each order in its column and shows the live indicator', async () => {
    renderWithProviders(<Orders />, { route: '/admin/orders' });

    expect(await column('Novos').findByText('Cliente 1')).toBeInTheDocument();
    expect(column('Em preparo').getByText('Cliente 2')).toBeInTheDocument();
    expect(
      column('Concluídos hoje').getByText('Cliente 3'),
    ).toBeInTheDocument();
    expect(
      column('Saiu / Pronto').getByText('Nada saindo agora.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ao vivo');
  });

  it('a new order from the stream shows up in Novos', async () => {
    renderWithProviders(<Orders />, { route: '/admin/orders' });
    await column('Novos').findByText('Cliente 1');

    act(() => stream!.onEvent({ type: 'order_created', order: order(9) }));

    expect(column('Novos').getByText('Cliente 9')).toBeInTheDocument();
  });

  it('accepting calls transitionOrder and moves the card', async () => {
    transitionMock.mockResolvedValue({
      order: order(1, { status: 'accepted' }),
    });
    renderWithProviders(<Orders />, { route: '/admin/orders' });
    await column('Novos').findByText('Cliente 1');

    await userEvent.click(
      column('Novos').getByRole('button', { name: 'Aceitar' }),
    );

    expect(transitionMock).toHaveBeenCalledWith(1, { to: 'accepted' });
    await waitFor(() =>
      expect(column('Em preparo').getByText('Cliente 1')).toBeInTheDocument(),
    );
  });

  it('rejecting without a reason does not send; with a reason it does', async () => {
    transitionMock.mockResolvedValue({
      order: order(1, { status: 'rejected', rejectReason: 'closing' }),
    });
    renderWithProviders(<Orders />, { route: '/admin/orders' });
    await column('Novos').findByText('Cliente 1');

    await userEvent.click(
      column('Novos').getByRole('button', { name: 'Recusar' }),
    );
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.click(
      dialog.getByRole('button', { name: 'Recusar pedido' }),
    );
    expect(transitionMock).not.toHaveBeenCalled();

    await userEvent.click(
      dialog.getByRole('button', { name: 'Estamos fechando' }),
    );
    await userEvent.click(
      dialog.getByRole('button', { name: 'Recusar pedido' }),
    );

    expect(transitionMock).toHaveBeenCalledWith(1, {
      to: 'rejected',
      reason: 'closing',
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('a conflict shows the translated error and refreshes the board', async () => {
    transitionMock.mockRejectedValue(
      new OrderRejectedError('invalid_transition'),
    );
    renderWithProviders(<Orders />, { route: '/admin/orders' });
    await column('Novos').findByText('Cliente 1');
    const fetchesBefore = fetchMock.mock.calls.length;

    await userEvent.click(
      column('Novos').getByRole('button', { name: 'Aceitar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O pedido já mudou de status',
    );
    expect(fetchMock.mock.calls.length).toBeGreaterThan(fetchesBefore);
  });

  it('opens the detail drawer when the order number is clicked', async () => {
    renderWithProviders(<Orders />, { route: '/admin/orders' });
    await column('Novos').findByText('Cliente 1');

    await userEvent.click(column('Novos').getByRole('button', { name: '#1' }));

    expect(
      screen.getByRole('dialog', { name: 'Pedido #1' }),
    ).toBeInTheDocument();
  });

  it('the test-order button creates a sample order (dev only)', async () => {
    sampleMock.mockResolvedValue({ order: order(10) });
    renderWithProviders(<Orders />, { route: '/admin/orders' });
    await column('Novos').findByText('Cliente 1');

    await userEvent.click(
      screen.getByRole('button', { name: 'Pedido de teste' }),
    );
    expect(sampleMock).toHaveBeenCalled();
  });
});
