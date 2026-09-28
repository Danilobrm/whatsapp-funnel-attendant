import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../test/render.tsx';

import SettingsDrawer from './SettingsDrawer.tsx';

// Cada teste começa sem idioma salvo — senão o teste que troca pra en-US
// vaza o localStorage pro próximo teste do arquivo.
beforeEach(() => {
  localStorage.clear();
});

describe('SettingsDrawer', () => {
  it('renders nothing when closed', () => {
    renderWithProviders(<SettingsDrawer open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every available locale and marks the active one', () => {
    renderWithProviders(<SettingsDrawer open onClose={vi.fn()} />);

    const ptRadio = screen.getByRole('radio', {
      name: 'Português (Brasil)',
    });
    const enRadio = screen.getByRole('radio', { name: 'English (US)' });

    expect(ptRadio).toBeChecked();
    expect(enRadio).not.toBeChecked();
  });

  it('switches the interface language on selection', async () => {
    renderWithProviders(<SettingsDrawer open onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('radio', { name: 'English (US)' }));

    expect(
      await screen.findByRole('radio', { name: 'English (US)' }),
    ).toBeChecked();
    expect(screen.getByText('Interface language')).toBeInTheDocument();
  });

  it('closes on the close button and on Escape', async () => {
    const onClose = vi.fn();
    renderWithProviders(<SettingsDrawer open onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
