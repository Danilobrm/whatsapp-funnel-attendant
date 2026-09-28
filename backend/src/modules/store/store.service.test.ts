import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./store.repository.js", () => ({
  findStoreSettings: vi.fn(),
  saveStoreSettings: vi.fn(),
  listDeliveryZones: vi.fn(),
  createDeliveryZone: vi.fn(),
  updateDeliveryZone: vi.fn(),
  deleteDeliveryZone: vi.fn(),
}));

const repo = await import("./store.repository.js");
const { asTenantId } = await import("../tenants/tenant.types.js");
const {
  parseStoreSettings,
  getStoreSettings,
  updateStoreSettings,
  createZone,
  updateZone,
  removeZone,
  invalidateStoreSettingsCache,
  DEFAULT_STORE_SETTINGS,
} = await import("./store.service.js");
const { InvalidMenuError } = await import("../errors/invalidMenu.error.js");

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
};

beforeEach(() => {
  vi.resetAllMocks();
  invalidateStoreSettingsCache();
});

describe("parseStoreSettings", () => {
  it("aceita entrada válida", () => {
    expect(parseStoreSettings(VALID_INPUT)).toMatchObject({
      timezone: "America/Sao_Paulo",
      minOrderCents: 2000,
    });
  });

  it.each([
    [{ ...VALID_INPUT, timezone: "" }, "timezone_required"],
    [{ ...VALID_INPUT, timezone: "Nao/Existe" }, "timezone_required"],
    [
      { ...VALID_INPUT, openingHours: { mon: [["25:00", "15:00"]] } },
      "opening_hours_invalid",
    ],
    [{ ...VALID_INPUT, openingHours: { xyz: [] } }, "opening_hours_invalid"],
    [{ ...VALID_INPUT, minOrderCents: -1 }, "min_order_invalid"],
    [{ ...VALID_INPUT, minOrderCents: 10.5 }, "min_order_invalid"],
    [{ ...VALID_INPUT, estimatedMinutes: 0 }, "estimated_minutes_invalid"],
    [
      { ...VALID_INPUT, pickupEnabled: false, deliveryEnabled: false },
      "fulfillment_required",
    ],
    [{ ...VALID_INPUT, paymentMethods: [] }, "unknown_payment_method"],
    [{ ...VALID_INPUT, paymentMethods: ["boleto"] }, "unknown_payment_method"],
  ] as const)("rejeita %#: %s", (input, code) => {
    try {
      parseStoreSettings(input);
      expect.unreachable("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidMenuError);
      expect((err as InstanceType<typeof InvalidMenuError>).code).toBe(code);
    }
  });
});

describe("getStoreSettings", () => {
  it("cai no default quando o tenant não tem linha", async () => {
    (repo.findStoreSettings as ReturnType<typeof vi.fn>).mockResolvedValue(null);

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
