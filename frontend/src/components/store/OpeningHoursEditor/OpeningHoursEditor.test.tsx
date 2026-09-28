import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';
import OpeningHoursEditor from './OpeningHoursEditor.tsx';

import type { OpeningHours } from '../../../api/store';

describe('OpeningHoursEditor', () => {
  it('shows "closed" for a day with no intervals', () => {
    renderWithProviders(<OpeningHoursEditor value={{}} onChange={vi.fn()} />);
    expect(screen.getAllByText('Fechado')).toHaveLength(7);
  });

  it('renders the existing intervals as time inputs', () => {
    const value: OpeningHours = { mon: [['11:00', '15:00']] };
    renderWithProviders(<OpeningHoursEditor value={value} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue('11:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('15:00')).toBeInTheDocument();
  });

  it('adds an interval to a closed day', async () => {
    const onChange = vi.fn();
    renderWithProviders(<OpeningHoursEditor value={{}} onChange={onChange} />);

    const [firstAddButton] = screen.getAllByRole('button', {
      name: 'Adicionar intervalo',
    });
    await userEvent.click(firstAddButton!);

    expect(onChange).toHaveBeenCalledWith({ mon: [['18:00', '23:00']] });
  });

  it('removes an interval', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <OpeningHoursEditor value={{ mon: [['11:00', '15:00']] }} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remover intervalo' }));

    expect(onChange).toHaveBeenCalledWith({});
  });
});
