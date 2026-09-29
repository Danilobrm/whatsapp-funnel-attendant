import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';
import RejectDialog from './RejectDialog.tsx';

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  renderWithProviders(
    <RejectDialog orderNumber={42} onConfirm={onConfirm} onCancel={onCancel} />,
  );
  return { onConfirm, onCancel };
}

describe('RejectDialog', () => {
  it('cannot confirm without a reason', async () => {
    const { onConfirm } = renderDialog();
    const confirm = screen.getByRole('button', { name: 'Recusar pedido' });

    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms with the chosen reason', async () => {
    const { onConfirm } = renderDialog();

    await userEvent.click(
      screen.getByRole('button', { name: 'Item esgotado' }),
    );
    expect(
      screen.getByRole('button', { name: 'Item esgotado' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(
      screen.getByRole('button', { name: 'Recusar pedido' }),
    );

    expect(onConfirm).toHaveBeenCalledWith('sold_out', null);
  });

  it('"other" requires a note', async () => {
    const { onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Outro motivo' }));
    expect(
      screen.getByRole('button', { name: 'Recusar pedido' }),
    ).toBeDisabled();

    await userEvent.type(
      screen.getByLabelText('Explique o motivo ao cliente'),
      'Forno quebrou',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Recusar pedido' }),
    );

    expect(onConfirm).toHaveBeenCalledWith('other', 'Forno quebrou');
  });

  it('back and Escape cancel', async () => {
    const { onCancel } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
