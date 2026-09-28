import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/simulator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/simulator')>();
  return {
    ...actual,
    fetchSimulatorConversation: vi.fn(),
    sendSimulatorMessage: vi.fn(),
    resetSimulatorConversation: vi.fn(),
  };
});

const api = await import('../../api/simulator');
const { renderWithProviders, screen } = await import('../../test/render.tsx');
const { default: Simulator } = await import('./Simulator.tsx');

const fetchConversation = vi.mocked(api.fetchSimulatorConversation);
const sendMessage = vi.mocked(api.sendSimulatorMessage);

beforeEach(() => {
  vi.resetAllMocks();
  fetchConversation.mockResolvedValue([]);
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
    expect(sendMessage).toHaveBeenCalledWith('oi');
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
