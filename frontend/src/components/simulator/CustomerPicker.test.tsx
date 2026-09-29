import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SimulatorRejectedError } from '../../api/simulator/simulator.ts';
import { renderWithProviders, screen } from '../../test/render.tsx';
import CustomerPicker from './CustomerPicker.tsx';

const ANA = { contactId: '5561990000001', name: 'Ana', phone: '5561990000001' };

const onChange = vi.fn();
const onCreate = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
});

function setup(value: string | null = null) {
  return renderWithProviders(
    <CustomerPicker
      customers={[ANA]}
      value={value}
      onChange={onChange}
      onCreate={onCreate}
    />,
  );
}

describe('CustomerPicker', () => {
  it('shows the default customer when nothing is chosen', () => {
    setup();

    expect(
      screen.getByRole('button', { name: 'Cliente de teste' }),
    ).toHaveTextContent('Cliente padrão (você)');
  });

  it('shows the chosen customer with the phone', () => {
    setup('5561990000001');

    expect(
      screen.getByRole('button', { name: 'Cliente de teste' }),
    ).toHaveTextContent('Ana · 5561990000001');
  });

  it('picks a simulated customer by phone and goes back to the default with null', async () => {
    setup('5561990000001');

    await userEvent.click(
      screen.getByRole('button', { name: 'Cliente de teste' }),
    );
    await userEvent.click(
      screen.getByRole('option', { name: 'Cliente padrão (você)' }),
    );

    expect(onChange).toHaveBeenCalledWith(null);

    await userEvent.click(
      screen.getByRole('button', { name: 'Cliente de teste' }),
    );
    await userEvent.click(
      screen.getByRole('option', { name: 'Ana · 5561990000001' }),
    );

    expect(onChange).toHaveBeenCalledWith('5561990000001');
  });

  it('creates a customer, then switches to it and closes the form', async () => {
    onCreate.mockResolvedValue({
      contactId: '5561990000002',
      name: 'Bruno',
      phone: '5561990000002',
    });
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Bruno');
    await userEvent.type(
      screen.getByLabelText('Telefone (com DDD)'),
      '5561990000002',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Criar cliente' }),
    );

    expect(onCreate).toHaveBeenCalledWith({
      name: 'Bruno',
      phone: '5561990000002',
    });
    expect(onChange).toHaveBeenCalledWith('5561990000002');
    await vi.waitFor(() =>
      expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument(),
    );
  });

  it('renders a backend rejection through i18n, by code', async () => {
    onCreate.mockRejectedValue(new SimulatorRejectedError('phone_invalid'));
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Ana');
    await userEvent.type(screen.getByLabelText('Telefone (com DDD)'), '12');
    await userEvent.click(
      screen.getByRole('button', { name: 'Criar cliente' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Telefone inválido. Use de 8 a 15 dígitos.',
    );
    expect(onChange).not.toHaveBeenCalled();
    // O formulário continua aberto com o que foi digitado.
    expect(screen.getByLabelText('Nome')).toHaveValue('Ana');
  });

  it('falls back to the generic message for an unknown code or a network failure', async () => {
    onCreate.mockRejectedValueOnce(new SimulatorRejectedError('novo_code'));
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Ana');
    await userEvent.type(
      screen.getByLabelText('Telefone (com DDD)'),
      '5561990000001',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Criar cliente' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível criar o cliente.',
    );
    expect(
      screen.queryByText(/simulator\.customers\.errors/),
    ).not.toBeInTheDocument();

    onCreate.mockRejectedValueOnce(new Error('HTTP 500'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Criar cliente' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível criar o cliente.',
    );
  });

  it('cancel closes the form without creating anything', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('can be disabled while a message is in flight', () => {
    renderWithProviders(
      <CustomerPicker
        customers={[ANA]}
        value={null}
        onChange={onChange}
        onCreate={onCreate}
        disabled
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Cliente de teste' }),
    ).toBeDisabled();
  });
});
