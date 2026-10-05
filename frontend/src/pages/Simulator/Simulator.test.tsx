import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/simulator/simulator.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/simulator/simulator.ts')>();
  return {
    ...actual,
    fetchSimulatorConversation: vi.fn(),
    fetchSimulatorCart: vi.fn(),
    fetchSimulatedCustomers: vi.fn(),
    createSimulatedCustomer: vi.fn(),
    sendSimulatorMessage: vi.fn(),
    resetSimulatorConversation: vi.fn(),
  };
});

const api = await import('../../api/simulator/simulator.ts');
const { renderWithProviders, screen, within } =
  await import('../../test/render.tsx');
const { default: Simulator } = await import('./Simulator.tsx');

const fetchConversation = vi.mocked(api.fetchSimulatorConversation);
const sendMessage = vi.mocked(api.sendSimulatorMessage);
const fetchCart = vi.mocked(api.fetchSimulatorCart);
const fetchCustomers = vi.mocked(api.fetchSimulatedCustomers);
const createCustomer = vi.mocked(api.createSimulatedCustomer);

beforeEach(() => {
  vi.resetAllMocks();
  fetchConversation.mockResolvedValue([]);
  fetchCart.mockResolvedValue(null);
  fetchCustomers.mockResolvedValue([]);
});

describe('Simulator', () => {
  it('invites to start when the conversation is empty', async () => {
    renderWithProviders(<Simulator />);

    expect(
      await screen.findByText('Mande um "oi" para começar.'),
    ).toBeInTheDocument();
  });

  it('shows the reply and who wrote it', async () => {
    sendMessage.mockResolvedValue({
      replies: ['Oi! Eu sou Nina.'],
      provider: 'persona',
    });
    renderWithProviders(<Simulator />);
    await screen.findByText('Mande um "oi" para começar.');

    await userEvent.type(screen.getByRole('textbox'), 'oi{Enter}');

    expect(await screen.findByText('Oi! Eu sou Nina.')).toBeInTheDocument();
    expect(screen.getByText('Texto fixo da persona')).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledWith('oi', null);
  });

  it('renders a backend rejection through i18n', async () => {
    sendMessage.mockRejectedValue(
      new api.SimulatorRejectedError('text_too_long'),
    );
    renderWithProviders(<Simulator />);
    await screen.findByText('Mande um "oi" para começar.');

    await userEvent.type(screen.getByRole('textbox'), 'x{Enter}');

    expect(
      await screen.findByText('Mensagem longa demais.'),
    ).toBeInTheDocument();
  });

  it('falls back to the generic error for an unknown code', async () => {
    sendMessage.mockRejectedValue(new api.SimulatorRejectedError('novo_code'));
    renderWithProviders(<Simulator />);
    await screen.findByText('Mande um "oi" para começar.');

    await userEvent.type(screen.getByRole('textbox'), 'x{Enter}');

    expect(
      await screen.findByText('Falha ao enviar a mensagem. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('chat.errors.novo_code')).not.toBeInTheDocument();
  });

  it('reports a failed load without hiding the composer', async () => {
    fetchConversation.mockRejectedValue(new Error('HTTP 500'));
    renderWithProviders(<Simulator />);

    expect(
      await screen.findByText('Não foi possível carregar a conversa de teste.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});

const ANA = { contactId: '5561990000001', name: 'Ana', phone: '5561990000001' };

const CART = {
  status: 'awaiting_confirmation' as const,
  lines: [
    {
      number: 1,
      name: 'Coca 2L',
      size: null,
      options: [],
      quantity: 1,
      unitPriceCents: 1200,
      totalCents: 1200,
      notes: null,
    },
  ],
  subtotalCents: 1200,
  feeCents: 0,
  totalCents: 1200,
  fulfillment: 'pickup' as const,
  address: null,
  payment: 'Pix',
  changeFor: null,
  notes: null,
  pending: [],
};

describe('Simulator — clientes de teste', () => {
  it('chats with a chosen test customer, on its own conversation', async () => {
    fetchCustomers.mockResolvedValue([ANA]);
    fetchConversation.mockImplementation(async (contactId) =>
      contactId === '5561990000001'
        ? [{ direction: 'inbound', body: 'sou a Ana', createdAt: 't' }]
        : [],
    );
    sendMessage.mockResolvedValue({ replies: ['Oi, Ana!'], provider: 'agent' });
    renderWithProviders(<Simulator />);
    await screen.findByText('Mande um "oi" para começar.');

    await userEvent.click(
      screen.getByRole('button', { name: 'Cliente de teste' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: 'Ana · 5561990000001' }),
    );

    expect(await screen.findByText('sou a Ana')).toBeInTheDocument();
    expect(fetchConversation).toHaveBeenLastCalledWith('5561990000001');

    await userEvent.type(screen.getByRole('textbox'), 'oi{Enter}');
    expect(await screen.findByText('Oi, Ana!')).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledWith('oi', '5561990000001');
  });

  it('creates a customer and switches to its conversation', async () => {
    createCustomer.mockResolvedValue(ANA);
    renderWithProviders(<Simulator />);
    await screen.findByText('Mande um "oi" para começar.');

    await userEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Ana');
    await userEvent.type(
      screen.getByLabelText('Telefone (com DDD)'),
      '5561990000001',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Criar cliente' }),
    );

    await vi.waitFor(() =>
      expect(fetchConversation).toHaveBeenLastCalledWith('5561990000001'),
    );
    expect(
      screen.getByRole('button', { name: 'Cliente de teste' }),
    ).toHaveTextContent('Ana · 5561990000001');
  });
});

describe('Simulator — modo dev', () => {
  it('hides the debug panel by default', async () => {
    renderWithProviders(<Simulator />);
    await screen.findByText('Mande um "oi" para começar.');

    expect(
      screen.queryByRole('complementary', { name: 'Depuração do atendente' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modo dev' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows the cart and the tools called in the last turn', async () => {
    sendMessage.mockResolvedValue({
      replies: ['Anotei a Coca!'],
      provider: 'agent',
      debug: {
        toolCalls: [
          { name: 'add_item', args: { item_id: 30 }, result: { ok: true } },
        ],
        cart: CART,
      },
    });
    renderWithProviders(<Simulator />);
    await screen.findByText('Mande um "oi" para começar.');
    await userEvent.click(screen.getByRole('button', { name: 'Modo dev' }));

    const panel = screen.getByRole('complementary', {
      name: 'Depuração do atendente',
    });
    expect(within(panel).getByText('Carrinho vazio.')).toBeInTheDocument();
    expect(
      within(panel).getByText('Nenhuma ferramenta neste turno.'),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox'), 'uma coca{Enter}');

    expect(await within(panel).findByText(/1x Coca 2L/)).toBeInTheDocument();
    expect(
      within(panel).getByText('Aguardando confirmação'),
    ).toBeInTheDocument();
    expect(within(panel).getByText('add_item')).toBeInTheDocument();
  });

  it('shows the cart of the conversation as soon as it loads', async () => {
    fetchCart.mockResolvedValue(CART);
    renderWithProviders(<Simulator />);
    await screen.findByText('Mande um "oi" para começar.');

    await userEvent.click(screen.getByRole('button', { name: 'Modo dev' }));

    expect(await screen.findByText(/1x Coca 2L/)).toBeInTheDocument();
  });
});
