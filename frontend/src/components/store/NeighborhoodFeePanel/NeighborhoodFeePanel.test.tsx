import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';
import NeighborhoodFeePanel from './NeighborhoodFeePanel.tsx';

const ZONE = { id: 1, neighborhood: 'Centro', feeCents: 500, active: true };

function renderPanel(
  props: Partial<Parameters<typeof NeighborhoodFeePanel>[0]> = {},
) {
  const onSave = vi.fn();
  const onRemove = vi.fn();
  renderWithProviders(
    <NeighborhoodFeePanel
      neighborhood="Centro"
      zone={null}
      saving={false}
      onSave={onSave}
      onRemove={onRemove}
      {...props}
    />,
  );
  return { onSave, onRemove };
}

describe('NeighborhoodFeePanel', () => {
  it('invites to click the map when nothing is selected', () => {
    renderPanel({ neighborhood: null });
    expect(
      screen.getByText(
        'Clique num bairro do mapa para definir a taxa de entrega.',
      ),
    ).toBeInTheDocument();
  });

  it('new neighborhood: save disabled until a valid fee, then sends cents', async () => {
    const { onSave } = renderPanel();
    const save = screen.getByRole('button', { name: 'Salvar taxa' });
    expect(save).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Remover taxa' }),
    ).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Taxa de entrega (R$)'), '7,50');
    await userEvent.click(save);

    expect(onSave).toHaveBeenCalledWith(750);
  });

  it('existing zone: prefills the fee and removes', async () => {
    const { onRemove } = renderPanel({ zone: ZONE });

    expect(screen.getByLabelText('Taxa de entrega (R$)')).toHaveValue('5,00');
    expect(screen.getByText('Taxa atual: R$ 5,00')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remover taxa' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('shows the saving state', () => {
    renderPanel({ zone: ZONE, saving: true });
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
  });
});
