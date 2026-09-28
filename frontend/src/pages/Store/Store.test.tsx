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
    createZone: vi.fn(),
  };
});

import {
  createZone,
  fetchStoreSettings,
  fetchZones,
  saveStoreSettings,
} from '../../api/store';

import Store from './Store.tsx';

const fetchSettingsMock = vi.mocked(fetchStoreSettings);
const fetchZonesMock = vi.mocked(fetchZones);
const saveSettingsMock = vi.mocked(saveStoreSettings);
const createZoneMock = vi.mocked(createZone);

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

const ZONES = [{ id: 1, neighborhood: 'Centro', feeCents: 500, active: true }];

function renderPage() {
  return renderWithProviders(<Store />);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSettingsMock.mockResolvedValue({ settings: structuredClone(SETTINGS) });
  fetchZonesMock.mockResolvedValue({ zones: structuredClone(ZONES) });
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

    expect(await screen.findByDisplayValue('11:00')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Pix' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Cartão na entrega' })).not.toBeChecked();
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

  it('lists the delivery zones and adds a new one', async () => {
    createZoneMock.mockResolvedValue({
      zone: { id: 2, neighborhood: 'Moema', feeCents: 700, active: true },
    });
    renderPage();

    expect(await screen.findByDisplayValue('Centro')).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText('Bairro (ex.: Centro)'),
      'Moema',
    );
    await userEvent.type(screen.getByPlaceholderText('0,00'), '7,00');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(createZoneMock).toHaveBeenCalledWith({
        neighborhood: 'Moema',
        feeCents: 700,
        active: true,
      }),
    );
  });
});
