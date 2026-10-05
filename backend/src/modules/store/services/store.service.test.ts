import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import { asTenantId } from "../../tenants/types/tenant.types.js";
import { DEFAULT_STORE_SETTINGS } from "../utils/store.parse.js";
import { StoreService } from "./store.service.js";

const repo = {
  findStoreSettings: vi.fn(),
  saveStoreSettings: vi.fn(),
  listDeliveryZones: vi.fn(),
  createDeliveryZone: vi.fn(),
  updateDeliveryZone: vi.fn(),
  deleteDeliveryZone: vi.fn(),
};
const service = new StoreService(repo as never);
const getStoreSettings = service.getStoreSettings.bind(service);
const updateStoreSettings = service.updateStoreSettings.bind(service);
const createZone = service.createZone.bind(service);
const updateZone = service.updateZone.bind(service);
const removeZone = service.removeZone.bind(service);
const invalidateStoreSettingsCache =
  service.invalidateStoreSettingsCache.bind(service);

const TENANT = asTenantId(3);

const VALID_INPUT = {
  timezone: "America/Sao_Paulo",
  openingHours: { mon: [["11:00", "15:00"]] },
  paused: false,
  minOrderCents: 2000,
  estimatedMinutes: 40,
  pickupEnabled: true,
  deliveryEnabled: true,
  paymentMethods: ["pix", "cash"],
  pixKey: null,
  ownerWhatsapp: null,
  whatsappNumber: null,
  restaurantName: "Pizzaria Demo",
  logoUrl: "/produtos/logo.png",
  contactEmail: "contato@pizzaria.com",
  address: "Rua 1, 100 - Centro, Luziânia - GO",
  latitude: -16.2525,
  longitude: -47.9503,
};

beforeEach(() => {
  vi.resetAllMocks();
  invalidateStoreSettingsCache();
});

describe("getStoreSettings", () => {
  it("cai no default quando o tenant não tem linha", async () => {
    (repo.findStoreSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    await expect(getStoreSettings(TENANT)).resolves.toEqual(
      DEFAULT_STORE_SETTINGS,
    );
  });

  it("usa cache na segunda leitura", async () => {
    (repo.findStoreSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_STORE_SETTINGS,
    );

    await getStoreSettings(TENANT);
    await getStoreSettings(TENANT);

    expect(repo.findStoreSettings).toHaveBeenCalledTimes(1);
  });
});

describe("updateStoreSettings", () => {
  it("valida antes de persistir e atualiza o cache", async () => {
    (repo.saveStoreSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...VALID_INPUT,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const saved = await updateStoreSettings(TENANT, VALID_INPUT);

    expect(saved.minOrderCents).toBe(2000);
    expect(repo.saveStoreSettings).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ timezone: "America/Sao_Paulo" }),
    );

    await getStoreSettings(TENANT);
    expect(repo.findStoreSettings).not.toHaveBeenCalled();
  });
});

describe("zonas de entrega", () => {
  it("rejeita bairro vazio", async () => {
    await expect(
      createZone(TENANT, { neighborhood: "  ", feeCents: 500 }),
    ).rejects.toThrow(InvalidMenuError);
  });

  it("rejeita taxa negativa", async () => {
    await expect(
      createZone(TENANT, { neighborhood: "Centro", feeCents: -1 }),
    ).rejects.toThrow(InvalidMenuError);
  });

  it("updateZone lança zone_not_found quando o repositório devolve null", async () => {
    (repo.updateDeliveryZone as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    await expect(
      updateZone(TENANT, 999, { neighborhood: "Centro", feeCents: 500 }),
    ).rejects.toMatchObject({ code: "zone_not_found" });
  });

  it("removeZone lança zone_not_found quando nada foi apagado", async () => {
    (repo.deleteDeliveryZone as ReturnType<typeof vi.fn>).mockResolvedValue(
      false,
    );

    await expect(removeZone(TENANT, 999)).rejects.toMatchObject({
      code: "zone_not_found",
    });
  });
});
