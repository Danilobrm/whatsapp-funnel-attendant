import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/dashboard.repository.js", () => ({
  breakdown: vi.fn(),
  countActive: vi.fn(),
  dailyTotals: vi.fn(),
  topItems: vi.fn(),
}));
vi.mock("../../menulink/repositories/menuLink.repository.js", () => ({
  countMenuFunnel: vi.fn(),
}));
vi.mock("../../store/services/store.service.js", () => ({
  getStoreSettings: vi.fn(),
}));

const repo = await import("../repositories/dashboard.repository.js");
const funnel = await import("../../menulink/repositories/menuLink.repository.js");
const store = await import("../../store/services/store.service.js");
const { getDashboard } = await import("./dashboard.service.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(2);

const EVERY_DAY_18_TO_23 = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [
    d,
    [["18:00", "23:00"]],
  ]),
);

function settings(overrides: Record<string, unknown> = {}) {
  return {
    timezone: "America/Sao_Paulo",
    openingHours: EVERY_DAY_18_TO_23,
    paused: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mock(repo.dailyTotals).mockResolvedValue([]);
  mock(repo.topItems).mockResolvedValue([]);
  mock(repo.breakdown).mockResolvedValue([]);
  mock(repo.countActive).mockResolvedValue(0);
  mock(funnel.countMenuFunnel).mockResolvedValue({
    sent: 0,
    opened: 0,
    confirmed: 0,
    ordered: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getDashboard", () => {
  it("monta 'hoje' a partir do último dia (no fuso da loja) e calcula o ticket", async () => {
    // 22h em SP no dia 29 (01h UTC do dia 30).
    vi.setSystemTime(new Date("2026-09-30T01:00:00.000Z"));
    mock(store.getStoreSettings).mockResolvedValue(settings());
    mock(repo.dailyTotals).mockResolvedValue([
      { day: "2026-09-28", orders: 1, revenueCents: 1000, rejected: 0 },
      { day: "2026-09-29", orders: 4, revenueCents: 10000, rejected: 1 },
    ]);
    mock(repo.countActive).mockResolvedValue(2);

    const dashboard = await getDashboard(TENANT);

    expect(dashboard.today).toEqual({
      orders: 4,
      revenueCents: 10000,
      ticketCents: 2500,
      rejected: 1,
      active: 2,
    });
    expect(dashboard.last7Days).toHaveLength(7);
    expect(dashboard.last7Days.at(-1)?.day).toBe("2026-09-29");
    expect(dashboard.last7Days[0]?.day).toBe("2026-09-23");
  });

  it("busca desde o início do 1º dia da janela, no fuso da loja", async () => {
    vi.setSystemTime(new Date("2026-09-29T15:00:00.000Z"));
    mock(store.getStoreSettings).mockResolvedValue(settings());

    await getDashboard(TENANT);

    expect(repo.dailyTotals).toHaveBeenCalledWith(
      TENANT,
      new Date("2026-09-23T03:00:00.000Z"),
      "America/Sao_Paulo",
    );
    expect(repo.breakdown).toHaveBeenCalledWith(
      TENANT,
      expect.any(Date),
      "fulfillment",
    );
    expect(repo.breakdown).toHaveBeenCalledWith(
      TENANT,
      expect.any(Date),
      "payment_method",
    );
  });

  it("loja dentro do horário → aberta, sem próxima abertura", async () => {
    vi.setSystemTime(new Date("2026-09-29T22:00:00.000Z")); // 19h SP
    mock(store.getStoreSettings).mockResolvedValue(settings());

    const { store: status } = await getDashboard(TENANT);
    expect(status).toEqual({ open: true, paused: false, nextOpeningAt: null });
  });

  it("fora do horário → fechada com a próxima abertura", async () => {
    vi.setSystemTime(new Date("2026-09-29T15:00:00.000Z")); // 12h SP
    mock(store.getStoreSettings).mockResolvedValue(settings());

    const { store: status } = await getDashboard(TENANT);
    expect(status.open).toBe(false);
    expect(status.nextOpeningAt).toBe("2026-09-29T21:00:00.000Z"); // 18h SP
  });

  it("pausada → fechada e pausada, sem próxima abertura", async () => {
    vi.setSystemTime(new Date("2026-09-29T22:00:00.000Z"));
    mock(store.getStoreSettings).mockResolvedValue(settings({ paused: true }));

    const { store: status } = await getDashboard(TENANT);
    expect(status).toEqual({ open: false, paused: true, nextOpeningAt: null });
  });
});

describe("getDashboard — funil do cardápio", () => {
  it("traz o funil dos mesmos 7 dias das outras contagens", async () => {
    vi.setSystemTime(new Date("2026-09-30T01:00:00.000Z"));
    mock(store.getStoreSettings).mockResolvedValue(settings());
    mock(funnel.countMenuFunnel).mockResolvedValue({
      sent: 10,
      opened: 7,
      confirmed: 5,
      ordered: 4,
    });

    const dashboard = await getDashboard(TENANT);

    expect(dashboard.menuFunnel).toEqual({
      sent: 10,
      opened: 7,
      confirmed: 5,
      ordered: 4,
    });
    const [tenantArg, since] = mock(funnel.countMenuFunnel).mock.calls[0] ?? [];
    expect(tenantArg).toBe(TENANT);
    // Mesma janela do resto do resumo (início do dia 6 dias atrás, no fuso da loja).
    expect((since as Date).toISOString()).toBe("2026-09-23T03:00:00.000Z");
  });
});
