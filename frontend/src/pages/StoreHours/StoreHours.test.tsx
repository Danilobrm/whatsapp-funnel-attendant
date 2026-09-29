import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../test/render.tsx';

vi.mock('../../api/store/store.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/store/store.ts')>();
  return { ...actual, fetchStoreSettings: vi.fn(), saveStoreSettings: vi.fn() };
});

import { fetchStoreSettings } from '../../api/store/store.ts';

import StoreHours from './StoreHours.tsx';

const fetchSettingsMock = vi.mocked(fetchStoreSettings);

const SETTINGS = {
  timezone: 'America/Sao_Paulo',
  openingHours: { mon: [['11:00', '15:00']] as [string, string][] },
  paused: false,
  minOrderCents: 0,
  estimatedMinutes: 40,
  pickupEnabled: true,
  deliveryEnabled: true,
  paymentMethods: ['pix'] as ('pix' | 'cash' | 'card_on_delivery')[],
  pixKey: null,
  ownerWhatsapp: null,
  whatsappNumber: null,
  restaurantName: null,
  logoUrl: null,
  contactEmail: null,
  address: null,
  latitude: null,
  longitude: null,
};

function renderPage() {
  return renderWithProviders(<StoreHours />, { route: '/admin/store/hours' });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSettingsMock.mockResolvedValue({ settings: structuredClone(SETTINGS) });
});

describe('StoreHours', () => {
  it('keeps the title visible while loading', () => {
    fetchSettingsMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Horário de funcionamento' }),
    ).toBeInTheDocument();
  });

  it('renders the opening hours editor and marks its tab active', async () => {
    renderPage();

    expect(await screen.findByText('11:00–15:00')).toBeInTheDocument();
  });

  it('shows the load error', async () => {
    fetchSettingsMock.mockRejectedValue(new Error('HTTP 500'));
    renderPage();
    expect(
      await screen.findByText(
        'Não foi possível carregar as configurações da loja.',
      ),
    ).toBeInTheDocument();
  });
});
