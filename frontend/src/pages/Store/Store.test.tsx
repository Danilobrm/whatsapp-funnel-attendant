import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen, waitFor } from '../../test/render.tsx';

vi.mock('../../api/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/store')>();
  return {
    ...actual,
    fetchStoreSettings: vi.fn(),
    fetchZones: vi.fn(),
    saveStoreSettings: vi.fn(),
  };
});

import { fetchStoreSettings, fetchZones, saveStoreSettings } from '../../api/store';

import Store from './Store.tsx';

const fetchSettingsMock = vi.mocked(fetchStoreSettings);
const fetchZonesMock = vi.mocked(fetchZones);
const saveSettingsMock = vi.mocked(saveStoreSettings);

const AUTOSAVE_WAIT = { timeout: 2500 };

const SETTINGS = {
  timezone: 'America/Sao_Paulo',
  openingHours: { mon: [['11:00', '15:00']] as [string, string][] },
  paused: false,
  minOrderCents: 2000,
  estimatedMinutes: 40,
  pickupEnabled: true,
  deliveryEnabled: true,
  paymentMethods: ['pix', 'cash'] as ('pix' | 'cash' | 'card_on_delivery')[],
  pixKey: null,
  ownerWhatsapp: null,
};

function renderPage() {
  return renderWithProviders(<Store />, { route: '/admin/store' });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSettingsMock.mockResolvedValue({ settings: structuredClone(SETTINGS) });
  // A página não busca zonas (isso ficou pra aba /admin/store/delivery), mas o
  // mock evita rejeição não tratada caso algum outro código chame por engano.
  fetchZonesMock.mockResolvedValue({ zones: [] });
});

describe('Store — loading', () => {
  it('shows the title while loading', () => {
    fetchSettingsMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loja')).toBeInTheDocument();
  });

  it('shows an error when the settings cannot be loaded', async () => {
    fetchSettingsMock.mockRejectedValue(new Error('HTTP 500'));
    renderPage();

    expect(
      await screen.findByText('Não foi possível carregar as configurações da loja.'),
    ).toBeInTheDocument();
  });
});

describe('Store — settings', () => {
  it('renders the opening hours and payment methods', async () => {
    renderPage();

    expect(await screen.findByText('11:00–15:00')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Pix' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Cartão na entrega' })).not.toBeChecked();
  });

  it('does not fetch delivery zones on the general tab', async () => {
    renderPage();
    await screen.findByText('11:00–15:00');

    expect(fetchZonesMock).not.toHaveBeenCalled();
  });

  it('autosaves when the store is paused', async () => {
    saveSettingsMock.mockResolvedValue({
      settings: { ...SETTINGS, paused: true },
    });
    renderPage();
    await screen.findByText('A loja está funcionando normalmente pelo horário cadastrado.');

    await userEvent.click(screen.getByRole('button', { name: 'Fechar agora' }));

    await waitFor(
      () =>
        expect(saveSettingsMock).toHaveBeenCalledWith(
          expect.objectContaining({ paused: true }),
        ),
      AUTOSAVE_WAIT,
    );
  });
});

describe('Store — abas', () => {
  it('mostra as abas Geral e Entrega, com Geral ativa', async () => {
    renderPage();
    await screen.findByText('11:00–15:00');

    expect(screen.getByRole('link', { name: 'Geral' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Entrega' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
