import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';

import SyncStatus from './SyncStatus.tsx';

const labels = {
  pendingLabel: 'Alterações não salvas...',
  syncingLabel: 'Salvando...',
  syncedLabel: 'Salvo',
};

describe('SyncStatus', () => {
  it('renders nothing while idle', () => {
    const { container } = renderWithProviders(
      <SyncStatus state="idle" {...labels} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the pending state', () => {
    renderWithProviders(<SyncStatus state="pending" {...labels} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Alterações não salvas...',
    );
  });

  it('announces the syncing state', () => {
    renderWithProviders(<SyncStatus state="syncing" {...labels} />);
    expect(screen.getByRole('status')).toHaveTextContent('Salvando...');
  });

  it('announces the synced state', () => {
    renderWithProviders(<SyncStatus state="synced" {...labels} />);
    expect(screen.getByRole('status')).toHaveTextContent('Salvo');
  });
});
