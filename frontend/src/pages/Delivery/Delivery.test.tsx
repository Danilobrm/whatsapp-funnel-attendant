import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { features } from '../../config/features.ts';
import { renderWithProviders, screen, waitFor } from '../../test/render.tsx';

vi.mock('../../api/store/store.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/store/store.ts')>();
  return {
    ...actual,
    fetchStoreSettings: vi.fn(),
    fetchZones: vi.fn(),
    saveStoreSettings: vi.fn(),
    createZone: vi.fn(),
    updateZone: vi.fn(),
    deleteZone: vi.fn(),
    fetchStoreGeo: vi.fn(),
    setStoreCity: vi.fn(),
    searchCities: vi.fn(),
  };
});

// O Google Maps não roda em jsdom — o mapa vira uma lista de botões, um por bairro,
// que chama `onSelect` como o clique no polígono faria.
vi.mock('../../components/store/DeliveryMap/DeliveryMap.tsx', () => ({
  DeliveryMapSkeleton: () => <div data-testid="delivery-map-skeleton" />,
  default: ({
    geo,
    selectedKey,
    zonesByKey,
    onSelect,
  }: {
    geo: import('../../api/store/store.ts').StoreGeo;
    selectedKey: string | null;
    zonesByKey: Map<string, unknown>;
    onSelect: (n: import('../../api/store/store.ts').Neighborhood) => void;
  }) => (
    <div data-testid="delivery-map" data-selected={selectedKey ?? ''}>
      {geo.neighborhoods.map((n) => (
        <button
          key={n.key}
          type="button"
          data-configured={zonesByKey.has(n.key)}
          onClick={() => onSelect(n)}
        >
          mapa:{n.name}
        </button>
      ))}
    </div>
  ),
}));

import {
  createZone,
  deleteZone,
  fetchStoreGeo,
  fetchStoreSettings,
  fetchZones,
  searchCities,
  setStoreCity,
  updateZone,
  type StoreGeo,
} from '../../api/store/store.ts';

import Delivery from './Delivery.tsx';

const fetchSettingsMock = vi.mocked(fetchStoreSettings);
const fetchZonesMock = vi.mocked(fetchZones);
const createZoneMock = vi.mocked(createZone);
const updateZoneMock = vi.mocked(updateZone);
const deleteZoneMock = vi.mocked(deleteZone);
const fetchGeoMock = vi.mocked(fetchStoreGeo);
const setCityMock = vi.mocked(setStoreCity);
const searchCitiesMock = vi.mocked(searchCities);

const SQUARE = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ] as [number, number][][],
};

const GEO: StoreGeo = {
  cityOsmId: 334525,
  cityName: 'Luziânia',
  state: 'Goiás',
  cityGeometry: SQUARE,
  neighborhoods: [
    { osmId: 'way/1', name: 'Centro', key: 'centro', geometry: SQUARE },
    {
      osmId: 'way/2',
      name: 'Setor Mandu',
      key: 'setor mandu',
      geometry: SQUARE,
    },
  ],
  fetchedAt: '2026-09-29T00:00:00.000Z',
};

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
  whatsappNumber: null,
  restaurantName: null,
  logoUrl: null,
  contactEmail: null,
  address: null,
  latitude: null,
  longitude: null,
};

const ZONES = [{ id: 1, neighborhood: 'Centro', feeCents: 500, active: true }];

function renderPage() {
  return renderWithProviders(<Delivery />, { route: '/admin/store/delivery' });
}

beforeEach(() => {
  features.maps = true;
  vi.clearAllMocks();
  fetchSettingsMock.mockResolvedValue({ settings: structuredClone(SETTINGS) });
  fetchZonesMock.mockResolvedValue({ zones: structuredClone(ZONES) });
  fetchGeoMock.mockResolvedValue({ geo: GEO });
});

describe('Delivery — loading', () => {
  it('shows the title while loading', () => {
    fetchZonesMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Entrega' }),
    ).toBeInTheDocument();
  });
});

describe('Delivery — layout', () => {
  it('only shows the delivery-area map: no fulfillment card, no zones table', async () => {
    renderPage();
    await screen.findByTestId('delivery-map');

    expect(screen.queryByText('Retirada e entrega')).not.toBeInTheDocument();
    expect(screen.queryByText('Zonas de entrega')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(fetchSettingsMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Clique num bairro do mapa para definir a taxa de entrega.',
      ),
    ).toBeInTheDocument();
  });

  it('closes the fee panel', async () => {
    renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: 'mapa:Setor Mandu' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Setor Mandu' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(
      screen.queryByRole('heading', { name: 'Setor Mandu' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('delivery-map')).toHaveAttribute(
      'data-selected',
      '',
    );
  });
});

describe('Delivery — mapa', () => {
  it('sem cidade: pede para buscar e grava a escolhida', async () => {
    fetchGeoMock.mockResolvedValue({ geo: null });
    searchCitiesMock.mockResolvedValue({
      cities: [{ osmId: 334525, name: 'Luziânia', state: 'Goiás' }],
    });
    setCityMock.mockResolvedValue({ geo: GEO });
    renderPage();

    await userEvent.type(await screen.findByLabelText('Buscar cidade'), 'luzi');
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: /Luziânia/ },
        { timeout: 2000 },
      ),
    );

    expect(setCityMock).toHaveBeenCalledWith(334525);
    expect(await screen.findByTestId('delivery-map')).toBeInTheDocument();
    expect(screen.getByText('Luziânia · Goiás')).toBeInTheDocument();
  });

  it('mostra o erro traduzido quando o serviço de mapas falha', async () => {
    fetchGeoMock.mockResolvedValue({ geo: null });
    searchCitiesMock.mockResolvedValue({
      cities: [{ osmId: 1, name: 'Luziânia', state: null }],
    });
    setCityMock.mockRejectedValue(
      Object.assign(new Error('x'), { code: 'geo_unavailable' }),
    );
    renderPage();

    await userEvent.type(await screen.findByLabelText('Buscar cidade'), 'luzi');
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: /Luziânia/ },
        { timeout: 2000 },
      ),
    );

    expect(
      await screen.findByText(
        'O serviço de mapas não respondeu. Tente de novo em instantes.',
      ),
    ).toBeInTheDocument();
  });

  it('bairro com zona: seleciona, mostra a taxa e atualiza', async () => {
    updateZoneMock.mockResolvedValue({
      zone: { id: 1, neighborhood: 'Centro', feeCents: 800, active: true },
    });
    renderPage();

    const centro = await screen.findByRole('button', { name: 'mapa:Centro' });
    await waitFor(() =>
      expect(centro).toHaveAttribute('data-configured', 'true'),
    );
    await userEvent.click(centro);

    expect(screen.getByTestId('delivery-map')).toHaveAttribute(
      'data-selected',
      'centro',
    );
    expect(screen.getByRole('heading', { name: 'Centro' })).toBeInTheDocument();
    expect(screen.getByText('Taxa atual: R$ 5,00')).toBeInTheDocument();

    const fee = screen.getByRole('textbox', { name: 'Taxa de entrega (R$)' });
    await userEvent.clear(fee);
    await userEvent.type(fee, '8,00');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar taxa' }));

    await waitFor(() =>
      expect(updateZoneMock).toHaveBeenCalledWith(1, {
        neighborhood: 'Centro',
        feeCents: 800,
        active: true,
      }),
    );
  });

  it('bairro sem zona: cria pelo nome do mapa', async () => {
    createZoneMock.mockResolvedValue({
      zone: { id: 3, neighborhood: 'Setor Mandu', feeCents: 600, active: true },
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'mapa:Setor Mandu' }),
    );
    expect(screen.getByText('sem taxa definida')).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Taxa de entrega (R$)' }),
      '6,00',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar taxa' }));

    await waitFor(() =>
      expect(createZoneMock).toHaveBeenCalledWith({
        neighborhood: 'Setor Mandu',
        feeCents: 600,
        active: true,
      }),
    );
    expect(fetchZonesMock).toHaveBeenCalledTimes(2);
  });

  it('remove a taxa do bairro selecionado', async () => {
    deleteZoneMock.mockResolvedValue(undefined);
    renderPage();

    const centro = await screen.findByRole('button', { name: 'mapa:Centro' });
    await waitFor(() =>
      expect(centro).toHaveAttribute('data-configured', 'true'),
    );
    await userEvent.click(centro);
    await userEvent.click(screen.getByRole('button', { name: 'Remover taxa' }));

    await waitFor(() => expect(deleteZoneMock).toHaveBeenCalledWith(1));
  });

  it('trocar cidade volta para a busca e cancelar mantém o mapa', async () => {
    renderPage();
    await screen.findByTestId('delivery-map');

    await userEvent.click(
      screen.getByRole('button', { name: 'Trocar cidade' }),
    );
    expect(screen.getByLabelText('Buscar cidade')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByTestId('delivery-map')).toBeInTheDocument();
  });
});
