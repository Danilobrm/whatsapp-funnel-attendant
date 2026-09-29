import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { features } from '../../config/features.ts';
import { renderWithProviders, screen, waitFor } from '../../test/render.tsx';

vi.mock('../../api/menu/menu.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/menu/menu.ts')>();
  return { ...actual, uploadItemImage: vi.fn() };
});

vi.mock('../../api/store/store.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/store/store.ts')>();
  return {
    ...actual,
    fetchStoreSettings: vi.fn(),
    fetchZones: vi.fn(),
    saveStoreSettings: vi.fn(),
  };
});

// O Google Maps não roda em jsdom: o mapa vira um botão que "clica" num ponto fixo
// e expõe o pino atual e o enquadramento recebido.
vi.mock('../../components/store/LocationMap/LocationMap.tsx', () => ({
  LocationMapSkeleton: () => <div data-testid="location-map-skeleton" />,
  default: ({
    position,
    disabled,
    onChange,
  }: {
    position: { lat: number; lng: number } | null;
    disabled?: boolean;
    onChange: (p: { lat: number; lng: number }) => void;
  }) => (
    <div
      data-testid="location-map"
      data-position={position ? `${position.lat},${position.lng}` : ''}
      data-disabled={disabled ? 'true' : 'false'}
    >
      <button
        type="button"
        onClick={() => onChange({ lat: -16.25, lng: -47.95 })}
      >
        clicar no mapa
      </button>
    </div>
  ),
}));

import {
  fetchStoreSettings,
  fetchZones,
  saveStoreSettings,
} from '../../api/store/store.ts';

import { MenuRejectedError, uploadItemImage } from '../../api/menu/menu.ts';

import Store from './Store.tsx';

const uploadMock = vi.mocked(uploadItemImage);

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
  whatsappNumber: null,
  restaurantName: null,
  logoUrl: null,
  contactEmail: null,
  address: null,
  latitude: null,
  longitude: null,
};

function renderPage() {
  return renderWithProviders(<Store />, { route: '/admin/store' });
}

beforeEach(() => {
  features.maps = true;
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
    expect(
      screen.queryByLabelText('Nome do restaurante'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error when the settings cannot be loaded', async () => {
    fetchSettingsMock.mockRejectedValue(new Error('HTTP 500'));
    renderPage();

    expect(
      await screen.findByText(
        'Não foi possível carregar as configurações da loja.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Store — informações do restaurante', () => {
  it('renders name, e-mail, WhatsApp, location and photo; no payment/hours here', async () => {
    fetchSettingsMock.mockResolvedValue({
      settings: {
        ...structuredClone(SETTINGS),
        restaurantName: 'Pizzaria Demo',
        contactEmail: 'contato@pizzaria.com',
        address: 'Rua 1, 100 - Centro',
      },
    });
    renderPage();

    expect(await screen.findByLabelText('Nome do restaurante')).toHaveValue(
      'Pizzaria Demo',
    );
    expect(screen.getByLabelText('E-mail de contato')).toHaveValue(
      'contato@pizzaria.com',
    );
    expect(screen.getByLabelText('Localização')).toHaveValue(
      'Rua 1, 100 - Centro',
    );
    expect(
      screen.getByLabelText('WhatsApp do dono (avisos)'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Foto do restaurante')).toHaveAttribute(
      'type',
      'file',
    );

    expect(
      screen.queryByRole('checkbox', { name: 'Pix' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('11:00–15:00')).not.toBeInTheDocument();
  });

  it('does not fetch delivery zones on the general tab', async () => {
    renderPage();
    await screen.findByLabelText('Nome do restaurante');

    expect(fetchZonesMock).not.toHaveBeenCalled();
  });

  it('autosaves name and e-mail', async () => {
    saveSettingsMock.mockImplementation(async (s) => ({ settings: s }));
    renderPage();

    await userEvent.type(
      await screen.findByLabelText('Nome do restaurante'),
      'Pizzaria X',
    );
    await userEvent.type(screen.getByLabelText('E-mail de contato'), 'a@b.com');

    await waitFor(
      () =>
        expect(saveSettingsMock).toHaveBeenLastCalledWith(
          expect.objectContaining({
            restaurantName: 'Pizzaria X',
            contactEmail: 'a@b.com',
          }),
        ),
      AUTOSAVE_WAIT,
    );
  });

  it('shows the translated error when the backend rejects the e-mail', async () => {
    const { StoreRejectedError } = await import('../../api/store/store.ts');
    saveSettingsMock.mockRejectedValue(
      new StoreRejectedError('email_invalid', 'contactEmail'),
    );
    renderPage();

    await userEvent.type(
      await screen.findByLabelText('E-mail de contato'),
      'x@',
    );

    expect(
      await screen.findByText('E-mail de contato inválido.', {}, AUTOSAVE_WAIT),
    ).toBeInTheDocument();
  });

  it('has a service WhatsApp field that autosaves and explains what it is for', async () => {
    saveSettingsMock.mockImplementation(async (s) => ({ settings: s }));
    renderPage();

    const field = await screen.findByLabelText(/WhatsApp do atendimento/);
    expect(
      screen.getByText(/É para onde o cliente volta depois de montar o pedido/),
    ).toBeInTheDocument();
    await userEvent.type(field, '5561999990000');

    await waitFor(
      () =>
        expect(saveSettingsMock).toHaveBeenLastCalledWith(
          expect.objectContaining({ whatsappNumber: '5561999990000' }),
        ),
      AUTOSAVE_WAIT,
    );
  });

  it('sends null (not an empty string) when the service number is cleared', async () => {
    saveSettingsMock.mockImplementation(async (s) => ({ settings: s }));
    fetchSettingsMock.mockResolvedValue({
      settings: { ...SETTINGS, whatsappNumber: '5561999990000' },
    });
    renderPage();

    await userEvent.clear(
      await screen.findByLabelText(/WhatsApp do atendimento/),
    );

    await waitFor(
      () =>
        expect(saveSettingsMock).toHaveBeenLastCalledWith(
          expect.objectContaining({ whatsappNumber: null }),
        ),
      AUTOSAVE_WAIT,
    );
  });

  it('shows the translated error when the backend rejects the service number', async () => {
    const { StoreRejectedError } = await import('../../api/store/store.ts');
    saveSettingsMock.mockRejectedValue(
      new StoreRejectedError('whatsapp_number_invalid', 'whatsappNumber'),
    );
    renderPage();

    await userEvent.type(
      await screen.findByLabelText(/WhatsApp do atendimento/),
      '123',
    );

    expect(
      await screen.findByText(
        /Número do atendimento inválido/,
        {},
        AUTOSAVE_WAIT,
      ),
    ).toBeInTheDocument();
  });

  it('clicking the photo uploads and autosaves the returned URL', async () => {
    uploadMock.mockResolvedValue({ url: '/produtos/logo.png' });
    saveSettingsMock.mockImplementation(async (s) => ({ settings: s }));
    renderPage();

    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    await userEvent.upload(
      await screen.findByLabelText('Foto do restaurante'),
      file,
    );

    expect(uploadMock).toHaveBeenCalledWith(file);
    await waitFor(
      () =>
        expect(saveSettingsMock).toHaveBeenCalledWith(
          expect.objectContaining({ logoUrl: '/produtos/logo.png' }),
        ),
      AUTOSAVE_WAIT,
    );
    expect(
      screen.getByRole('button', { name: 'Remover foto' }),
    ).toBeInTheDocument();
  });

  it('shows the upload error for an invalid image', async () => {
    uploadMock.mockRejectedValue(
      new MenuRejectedError('image_invalid_type', 'image'),
    );
    renderPage();

    await userEvent.upload(
      await screen.findByLabelText('Foto do restaurante'),
      new File(['x'], 'a.png', { type: 'image/png' }),
    );

    expect(
      await screen.findByText(
        'Formato de imagem não aceito. Use JPG, PNG, WEBP ou GIF.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Store — localização no mapa', () => {
  it('the address is read-only and the map cannot be edited', async () => {
    fetchSettingsMock.mockResolvedValue({
      settings: { ...structuredClone(SETTINGS), address: 'Rua 1, Luziânia' },
    });
    renderPage();

    expect(await screen.findByLabelText('Localização')).toHaveAttribute(
      'readonly',
    );
    expect(await screen.findByTestId('location-map')).toHaveAttribute(
      'data-disabled',
      'true',
    );
  });

  it('has no button to pick the location in the panel', async () => {
    renderPage();
    await screen.findByTestId('location-map');

    expect(
      screen.queryByRole('button', { name: /localização atual/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Localizar pelo endereço' }),
    ).not.toBeInTheDocument();
  });

  it('removes the pin and the address together', async () => {
    fetchSettingsMock.mockResolvedValue({
      settings: {
        ...structuredClone(SETTINGS),
        address: 'Rua 1',
        latitude: -16.25,
        longitude: -47.95,
      },
    });
    saveSettingsMock.mockImplementation(async (s) => ({ settings: s }));
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remover pino' }),
    );

    expect(screen.getByTestId('location-map')).toHaveAttribute(
      'data-position',
      '',
    );
    await waitFor(
      () =>
        expect(saveSettingsMock).toHaveBeenCalledWith(
          expect.objectContaining({
            latitude: null,
            longitude: null,
            address: null,
          }),
        ),
      AUTOSAVE_WAIT,
    );
  });
});

describe('Store — localização desligada', () => {
  afterEach(() => {
    features.storeLocation = true;
  });

  it('sem o recurso, não há seção de localização nem mapa', async () => {
    features.storeLocation = false;
    renderPage();
    await screen.findByLabelText('Nome do restaurante');

    expect(screen.queryByText('Localização no mapa')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('location-map-skeleton'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Entrega' }),
    ).not.toBeInTheDocument();
  });
});
