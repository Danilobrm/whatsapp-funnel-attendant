import { beforeEach, describe, expect, it, vi } from "vitest";

import { MENU } from "../../order/utils/fixtures.test-util.js";

vi.mock("../../menu/services/menu.service.js", () => ({ getPublishedMenu: vi.fn() }));
vi.mock("../../store/services/store.service.js", () => ({ getStoreSettings: vi.fn() }));
vi.mock("../../order/repositories/order.repository.js", () => ({
  findLastOrderForCustomer: vi.fn(),
}));

const menuService = await import("../../menu/services/menu.service.js");
const storeService = await import("../../store/services/store.service.js");
const orderRepo = await import("../../order/repositories/order.repository.js");
const { describePastDay, formatStoreNow, loadPromptContext, storeContext } =
  await import("./agent.context.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(4);
const TZ = "America/Sao_Paulo";
// terça 29/09/2026, 19:32 em São Paulo
const NOW = new Date("2026-09-29T22:32:00.000Z");

const ALWAYS_OPEN = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [
    d,
    [["00:00", "23:59"]],
  ]),
);
const SETTINGS = {
  timezone: TZ,
  openingHours: ALWAYS_OPEN,
  paused: false,
} as never;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("formatStoreNow", () => {
  it("renders weekday, date and time in the STORE timezone", () => {
    const text = formatStoreNow(NOW, TZ);

    expect(text).toContain("terça-feira");
    expect(text).toContain("29/09");
    expect(text).toContain("19:32");
  });
});

describe("describePastDay", () => {
  it.each([
    ["2026-09-29T15:00:00.000Z", "hoje"],
    ["2026-09-28T15:00:00.000Z", "ontem"],
    ["2026-09-26T15:00:00.000Z", "sábado"],
    ["2026-09-15T15:00:00.000Z", "há 14 dias"],
  ])("%s → %s", (iso, expected) => {
    expect(describePastDay(new Date(iso), NOW, TZ)).toBe(expected);
  });

  // 01:00 UTC do dia 29 ainda é a noite do dia 28 em São Paulo.
  it("compares days in the store timezone, not UTC", () => {
    expect(describePastDay(new Date("2026-09-29T01:00:00.000Z"), NOW, TZ)).toBe(
      "ontem",
    );
  });
});

describe("storeContext", () => {
  it("open store has no next opening", () => {
    expect(storeContext(SETTINGS, NOW)).toMatchObject({
      open: true,
      paused: false,
      nextOpeningText: null,
    });
  });

  it("closed store says when it opens again", () => {
    const settings = {
      timezone: TZ,
      openingHours: { wed: [["11:00", "15:00"]] },
      paused: false,
    } as never;

    expect(storeContext(settings, NOW)).toMatchObject({
      open: false,
      nextOpeningText: "amanhã às 11h",
    });
  });

  it("paused store is closed with no opening time", () => {
    const settings = {
      timezone: TZ,
      openingHours: ALWAYS_OPEN,
      paused: true,
    } as never;

    expect(storeContext(settings, NOW)).toMatchObject({
      open: false,
      paused: true,
      nextOpeningText: null,
    });
  });
});

describe("loadPromptContext", () => {
  beforeEach(() => {
    mock(storeService.getStoreSettings).mockResolvedValue(SETTINGS);
    mock(menuService.getPublishedMenu).mockResolvedValue(MENU);
  });

  it("builds store, menu summary and no customer block for an unknown customer", async () => {
    const ctx = await loadPromptContext(TENANT, null, null, NOW);

    expect(ctx.store?.open).toBe(true);
    expect(ctx.menuSummary).toContain("Pizza");
    expect(ctx.customer).toBeNull();
    expect(orderRepo.findLastOrderForCustomer).not.toHaveBeenCalled();
  });

  it("gives a returning customer their last address and last order", async () => {
    mock(orderRepo.findLastOrderForCustomer).mockResolvedValue({
      number: 12,
      createdAt: "2026-09-26T15:00:00.000Z",
      items: [
        {
          name: "Pizza",
          sizeName: "Grande",
          quantity: 1,
          unitPriceCents: 6850,
          options: [
            { group: "Sabores", name: "Calabresa", priceCents: 0 },
            { group: "Sabores", name: "Marguerita", priceCents: 0 },
          ],
          notes: null,
        },
        {
          name: "Coca 2L",
          sizeName: null,
          quantity: 2,
          unitPriceCents: 1200,
          options: [],
          notes: null,
        },
      ],
    });

    const ctx = await loadPromptContext(
      TENANT,
      {
        id: 5,
        phone: "1",
        name: "Ana",
        lastAddress: {
          street: "Rua 7",
          number: "10",
          complement: null,
          reference: null,
          neighborhood: "Centro",
        },
      },
      null,
      NOW,
    );

    expect(orderRepo.findLastOrderForCustomer).toHaveBeenCalledWith(TENANT, 5);
    expect(ctx.customer).toEqual({
      name: "Ana",
      lastAddress: "Rua 7, 10 - Centro",
      lastOrder: {
        number: 12,
        whenText: "sábado",
        lines: ["1x Pizza Grande (Calabresa + Marguerita)", "2x Coca 2L"],
      },
    });
  });

  it("falls back to the channel profile name", async () => {
    mock(orderRepo.findLastOrderForCustomer).mockResolvedValue(null);

    const ctx = await loadPromptContext(
      TENANT,
      { id: 5, phone: "1", name: null, lastAddress: null },
      "Bia",
      NOW,
    );

    expect(ctx.customer).toEqual({
      name: "Bia",
      lastAddress: null,
      lastOrder: null,
    });
  });
});
