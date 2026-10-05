import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen, waitFor } from '../../test/render.tsx';

vi.mock('../../api/store/store.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/store/store.ts')>();
  return { ...actual, fetchStoreSettings: vi.fn(), saveStoreSettings: vi.fn() };
});

import {
  fetchStoreSettings,
  saveStoreSettings,
  StoreRejectedError,
} from '../../api/store/store.ts';

import StorePayment from './StorePayment.tsx';

const fetchSettingsMock = vi.mocked(fetchStoreSettings);
const saveSettingsMock = vi.mocked(saveStoreSettings);

const AUTOSAVE_WAIT = { timeout: 2500 };

const SETTINGS = {
  timezone: 'America/Sao_Paulo',
  openingHours: {},
  paused: false,
  minOrderCents: 0,
  estimatedMinutes: 40,
  pickupEnabled: true,
  deliveryEnabled: true,
  paymentMethods: ['pix', 'cash'] as ('pix' | 'cash' | 'card_on_delivery')[],
  pixKey: 'chave@pix.com',
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
  return renderWithProviders(<StorePayment />, {
    route: '/admin/store/payment',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSettingsMock.mockResolvedValue({ settings: structuredClone(SETTINGS) });
});

describe('StorePayment', () => {
  it('keeps the title visible while loading', () => {
    fetchSettingsMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Pagamento' }),
    ).toBeInTheDocument();
  });

  it('renders Pix, Dinheiro and Cartão with the Pix key, tab active', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: 'Pix' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Dinheiro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Cartão na entrega' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Chave Pix')).toHaveValue('chave@pix.com');
  });

  it('enables card and autosaves', async () => {
    saveSettingsMock.mockImplementation(async (s) => ({ settings: s }));
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Cartão na entrega' }),
    );

    await waitFor(
      () =>
        expect(saveSettingsMock).toHaveBeenCalledWith(
          expect.objectContaining({
            paymentMethods: ['pix', 'cash', 'card_on_delivery'],
          }),
        ),
      AUTOSAVE_WAIT,
    );
  });

  it('hides the Pix key when Pix is disabled', async () => {
    saveSettingsMock.mockImplementation(async (s) => ({ settings: s }));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Pix' }));

    expect(screen.queryByLabelText('Chave Pix')).not.toBeInTheDocument();
  });

  it('shows the translated rejection when every method is disabled', async () => {
    saveSettingsMock.mockRejectedValue(
      new StoreRejectedError('unknown_payment_method', 'paymentMethods'),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Pix' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dinheiro' }));

    expect(
      await screen.findByText(
        'Selecione ao menos uma forma de pagamento válida.',
        {},
        AUTOSAVE_WAIT,
      ),
    ).toBeInTheDocument();
  });
});
