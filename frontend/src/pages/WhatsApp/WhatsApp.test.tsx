import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen, within } from '../../test/render.tsx';
import WhatsApp from './WhatsApp.tsx';

function list() {
  return screen.getByRole('complementary', { name: 'Conversas' });
}

describe('WhatsApp', () => {
  it('lists the mocked conversations with last message and unread badge', () => {
    renderWithProviders(<WhatsApp />);

    expect(within(list()).getByText('Mariana Souza')).toBeInTheDocument();
    expect(within(list()).getByText('Entrega no Centro')).toBeInTheDocument();
    expect(within(list()).getByText('João Pereira')).toBeInTheDocument();
    expect(
      within(list()).getAllByLabelText('mensagens não lidas'),
    ).toHaveLength(2);
    expect(screen.getByText('WhatsApp do restaurante')).toBeInTheDocument();
  });

  it('filters by name and by phone digits', async () => {
    renderWithProviders(<WhatsApp />);
    const search = screen.getByLabelText(
      'Pesquisar ou começar uma nova conversa',
    );

    await userEvent.type(search, 'ana');
    expect(within(list()).getByText('Ana Lima')).toBeInTheDocument();
    expect(within(list()).queryByText('João Pereira')).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, '91234');
    expect(within(list()).getByText('João Pereira')).toBeInTheDocument();
    expect(within(list()).queryByText('Ana Lima')).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(
      screen.getByText('Nenhuma conversa encontrada.'),
    ).toBeInTheDocument();
  });

  it('opens a conversation, clears its unread badge and shows both sides', async () => {
    renderWithProviders(<WhatsApp />);

    await userEvent.click(within(list()).getByText('Mariana Souza'));

    expect(
      screen.getByRole('heading', { name: 'Mariana Souza' }),
    ).toBeInTheDocument();
    expect(screen.getByText('+55 11 98765-4321')).toBeInTheDocument();
    expect(
      screen
        .getByText('Quero uma pizza grande meio calabresa meio marguerita')
        .closest('[data-direction]'),
    ).toHaveAttribute('data-direction', 'in');
    expect(screen.getAllByRole('img', { name: 'Lida' }).length).toBeGreaterThan(
      0,
    );
    expect(
      within(list()).getAllByLabelText('mensagens não lidas'),
    ).toHaveLength(1);
  });

  it('sends a message locally as outgoing', async () => {
    renderWithProviders(<WhatsApp />);
    await userEvent.click(within(list()).getByText('Ana Lima'));

    const send = screen.getByRole('button', { name: 'Enviar' });
    expect(send).toBeDisabled();

    await userEvent.type(
      screen.getByLabelText('Digite uma mensagem'),
      'Pedido confirmado!{Enter}',
    );

    const bubble = screen
      .getAllByText('Pedido confirmado!')
      .find((el) => el.closest('[data-direction]'));
    expect(bubble?.closest('[data-direction]')).toHaveAttribute(
      'data-direction',
      'out',
    );
    expect(screen.getByRole('img', { name: 'Enviada' })).toBeInTheDocument();
    expect(screen.getByLabelText('Digite uma mensagem')).toHaveValue('');
  });

  it('goes back to the list', async () => {
    renderWithProviders(<WhatsApp />);
    await userEvent.click(within(list()).getByText('Ana Lima'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Voltar para as conversas' }),
    );
    expect(screen.getByText('WhatsApp do restaurante')).toBeInTheDocument();
  });
});
