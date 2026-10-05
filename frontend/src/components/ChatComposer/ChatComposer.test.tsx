import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CHAT_COMMANDS, buildQuestionCommands } from '../../hooks/chatCommands/chatCommands.ts';
import { renderWithProviders, screen } from '../../test/render.tsx';

import ChatComposer from './ChatComposer.tsx';

const questionCommands = buildQuestionCommands([
  { id: 1, question: 'Como rastrear meu pedido?' },
  { id: 2, question: 'Quais formas de pagamento são aceitas?' },
]);

describe('ChatComposer — menu de barra', () => {
  it('lists panel commands from their i18n keys', async () => {
    renderWithProviders(
      <ChatComposer onSubmit={vi.fn()} commands={CHAT_COMMANDS} />,
    );

    await userEvent.type(screen.getByRole('textbox'), '/');

    expect(
      screen.getByRole('option', { name: /\/reiniciar/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /Apagar esta conversa de teste/ }),
    ).toBeInTheDocument();
  });

  it('lists suggested questions as plain labels', async () => {
    renderWithProviders(
      <ChatComposer onSubmit={vi.fn()} commands={questionCommands} />,
    );

    await userEvent.type(screen.getByRole('textbox'), '/');

    expect(
      screen.getByRole('option', { name: 'Como rastrear meu pedido?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: 'Quais formas de pagamento são aceitas?',
      }),
    ).toBeInTheDocument();
  });

  it('filters the questions by what comes after the slash', async () => {
    renderWithProviders(
      <ChatComposer onSubmit={vi.fn()} commands={questionCommands} />,
    );

    await userEvent.type(screen.getByRole('textbox'), '/pagamento');

    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(
      screen.getByRole('option', {
        name: 'Quais formas de pagamento são aceitas?',
      }),
    ).toBeInTheDocument();
  });

  it('submits the question text, not the trigger', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <ChatComposer onSubmit={onSubmit} commands={questionCommands} />,
    );

    await userEvent.type(screen.getByRole('textbox'), '/rastrear');
    await userEvent.click(
      screen.getByRole('option', { name: 'Como rastrear meu pedido?' }),
    );

    expect(onSubmit).toHaveBeenCalledWith('Como rastrear meu pedido?');
  });

  it('submits the trigger for a panel command', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <ChatComposer onSubmit={onSubmit} commands={CHAT_COMMANDS} />,
    );

    await userEvent.type(screen.getByRole('textbox'), '/rein');
    await userEvent.click(screen.getByRole('option', { name: /\/reiniciar/ }));

    expect(onSubmit).toHaveBeenCalledWith('/reiniciar');
  });

  it('names the menu after the caller', async () => {
    renderWithProviders(
      <ChatComposer
        onSubmit={vi.fn()}
        commands={questionCommands}
        commandsTitle="Sugestões"
      />,
    );

    await userEvent.type(screen.getByRole('textbox'), '/');

    expect(
      screen.getByRole('listbox', { name: 'Sugestões' }),
    ).toBeInTheDocument();
  });

  it('keeps a plain composer when there are no commands', async () => {
    renderWithProviders(<ChatComposer onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox'), '/');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('renders a pill field with a separate round send button (WhatsApp style)', async () => {
    renderWithProviders(<ChatComposer onSubmit={vi.fn()} />);

    const field = screen.getByTestId('composer-field');
    const send = screen.getByRole('button', { name: 'Enviar' });
    expect(field).toContainElement(screen.getByRole('textbox'));
    expect(field).not.toContainElement(send);
    expect(send).toHaveClass('rounded-full');
    expect(send).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox'), 'oi');
    expect(send).toBeEnabled();
  });
});
