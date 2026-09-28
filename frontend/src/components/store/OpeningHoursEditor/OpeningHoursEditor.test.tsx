import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';
import OpeningHoursEditor from './OpeningHoursEditor.tsx';

import type { OpeningHours } from '../../../api/store';

describe('OpeningHoursEditor', () => {
  it('renderiza as 7 barras de dia, cada uma fechada por padrão', () => {
    renderWithProviders(<OpeningHoursEditor value={{}} onChange={vi.fn()} />);
    expect(screen.getAllByText('Fechado')).toHaveLength(7);
  });

  it('mostra o intervalo existente do dia certo', () => {
    const value: OpeningHours = { mon: [['11:00', '15:00']] };
    renderWithProviders(<OpeningHoursEditor value={value} onChange={vi.fn()} />);

    expect(screen.getByText('11:00 – 15:00')).toBeInTheDocument();
    // Só segunda tem intervalo — as outras 6 continuam "Fechado".
    expect(screen.getAllByText('Fechado')).toHaveLength(6);
  });

  it('adicionar intervalo num dia fechado grava só naquele dia', async () => {
    const onChange = vi.fn();
    renderWithProviders(<OpeningHoursEditor value={{}} onChange={onChange} />);

    // As barras seguem a ordem seg..dom — o primeiro botão "Adicionar" é da segunda.
    const [addToMonday] = screen.getAllByRole('button', {
      name: 'Adicionar intervalo',
    });
    await userEvent.click(addToMonday!);

    expect(onChange).toHaveBeenCalledWith({ mon: [['11:00', '15:00']] });
  });

  it('remover o único intervalo do dia apaga a chave do dia (fica fechado)', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <OpeningHoursEditor value={{ tue: [['11:00', '15:00']] }} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remover intervalo' }));

    expect(onChange).toHaveBeenCalledWith({});
  });

  it('desabilita as barras quando disabled', () => {
    renderWithProviders(
      <OpeningHoursEditor
        value={{ mon: [['11:00', '15:00']] }}
        onChange={vi.fn()}
        disabled
      />,
    );

    expect(screen.getByTestId('handle-0-start')).toHaveAttribute('tabindex', '-1');
  });
});
