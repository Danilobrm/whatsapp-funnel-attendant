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

import Delivery from './Delivery.tsx';

const fetchSettingsMock = vi.mocked(fetchStoreSettings);
const fetchZonesMock = vi.mocked(fetchZones);
const saveSettingsMock = vi.mocked(saveStoreSettings);
const createZoneMock = vi.mocked(createZone);

const AUTOSAVE_WAIT = { timeout: 2500 };

const SETTINGS = {
  timezone: 'America/Sao_Paulo',
  openingHours: {},
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
  return renderWithProviders(<Delivery />, { route: '/admin/store/delivery' });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSettingsMock.mockResolvedValue({ settings: structuredClone(SETTINGS) });
  fetchZonesMock.mockResolvedValue({ zones: structuredClone(ZONES) });
});

describe('Delivery — loading', () => {
  it('shows the title while loading', () => {
    fetchSettingsMock.mockReturnValue(new Promise(() => {}));
    fetchZonesMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('heading', { name: 'Entrega' })).toBeInTheDocument();
  });
});

describe('Delivery — fulfillment', () => {
  it('renders pickup/delivery toggles and minimum order', async () => {
    renderPage();

    expect(await screen.findByRole('checkbox', { name: 'Retirada no balcão' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Entrega' })).toBeChecked();
    expect(screen.getByDisplayValue('20,00')).toBeInTheDocument();
  });

  it('autosaves when toggling pickup off', async () => {
    saveSettingsMock.mockResolvedValue({
      settings: { ...SETTINGS, pickupEnabled: false },
    });
    renderPage();

    const pickup = await screen.findByRole('checkbox', { name: 'Retirada no balcão' });
    await userEvent.click(pickup);

    await waitFor(
      () =>
        expect(saveSettingsMock).toHaveBeenCalledWith(
          expect.objectContaining({ pickupEnabled: false }),
        ),
      AUTOSAVE_WAIT,
    );
  });
});

describe('Delivery — zonas', () => {
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

describe('Delivery — abas', () => {
  it('mostra Entrega como aba ativa', async () => {
    renderPage();
    await screen.findByDisplayValue('Centro');

    expect(screen.getByRole('link', { name: 'Entrega' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
