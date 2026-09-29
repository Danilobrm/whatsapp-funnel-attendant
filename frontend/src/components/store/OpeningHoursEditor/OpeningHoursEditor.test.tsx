import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';
import OpeningHoursEditor from './OpeningHoursEditor.tsx';

describe('OpeningHoursEditor', () => {
  it('delega pra WeekHoursGrid, passando value/onChange/disabled adiante', () => {
    renderWithProviders(
      <OpeningHoursEditor
        value={{ mon: [['11:00', '15:00']] }}
        onChange={vi.fn()}
        disabled
      />,
    );

    expect(screen.getByText('11:00–15:00')).toBeInTheDocument();
    expect(screen.getByTestId('handle-mon-0-start')).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });
});
