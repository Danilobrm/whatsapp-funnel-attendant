import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen, waitFor } from '../../../test/render.tsx';

vi.mock('../../../api/store/store.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/store/store.ts')>();
  return { ...actual, searchCities: vi.fn() };
});

import { searchCities } from '../../../api/store/store.ts';

import CityPicker from './CityPicker.tsx';

const searchMock = vi.mocked(searchCities);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CityPicker', () => {
  it('does not search with fewer than 2 characters', async () => {
    renderWithProviders(<CityPicker onPick={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Buscar cidade'), 'l');
    await new Promise((r) => setTimeout(r, 500));
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('searches (debounced) and picks a city', async () => {
    searchMock.mockResolvedValue({
      cities: [{ osmId: 334525, name: 'Luziânia', state: 'Goiás' }],
    });
    const onPick = vi.fn();
    renderWithProviders(<CityPicker onPick={onPick} />);

    await userEvent.type(screen.getByLabelText('Buscar cidade'), 'luzi');
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: /Luziânia/ },
        { timeout: 2000 },
      ),
    );

    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock).toHaveBeenCalledWith('luzi');
    expect(onPick).toHaveBeenCalledWith({
      osmId: 334525,
      name: 'Luziânia',
      state: 'Goiás',
    });
  });

  it('shows empty and error states', async () => {
    searchMock.mockResolvedValueOnce({ cities: [] });
    renderWithProviders(<CityPicker onPick={vi.fn()} />);
    const input = screen.getByLabelText('Buscar cidade');

    await userEvent.type(input, 'xyz');
    expect(
      await screen.findByText(
        'Nenhuma cidade encontrada.',
        {},
        { timeout: 2000 },
      ),
    ).toBeInTheDocument();

    searchMock.mockRejectedValueOnce(new Error('502'));
    await userEvent.type(input, 'w');
    await waitFor(
      () =>
        expect(
          screen.getByText(
            'O serviço de mapas não respondeu. Tente de novo em instantes.',
          ),
        ).toBeInTheDocument(),
      { timeout: 2000 },
    );
  });
});
