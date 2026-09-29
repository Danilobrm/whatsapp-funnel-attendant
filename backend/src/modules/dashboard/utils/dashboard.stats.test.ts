import { describe, expect, it } from "vitest";

import { dayKeyInZone, fillDays, ticketCents } from "./dashboard.stats.js";

describe("dayKeyInZone", () => {
  it("usa o dia da loja, não o UTC", () => {
    // 01h UTC do dia 30 = 22h do dia 29 em São Paulo.
    const date = new Date("2026-09-30T01:00:00.000Z");
    expect(dayKeyInZone(date, "America/Sao_Paulo")).toBe("2026-09-29");
    expect(dayKeyInZone(date, "UTC")).toBe("2026-09-30");
  });
});

describe("fillDays", () => {
  it("completa os dias sem pedido com zero, em ordem cronológica", () => {
    const series = fillDays(
      [
        { day: "2026-09-29", orders: 3, revenueCents: 9000, rejected: 1 },
        { day: "2026-09-25", orders: 1, revenueCents: 2000, rejected: 0 },
      ],
      "2026-09-29",
      7,
    );

    expect(series.map((d) => d.day)).toEqual([
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
    ]);
    expect(series[2]).toEqual({
      day: "2026-09-25",
      orders: 1,
      revenueCents: 2000,
      rejected: 0,
    });
    expect(series[3]).toEqual({
      day: "2026-09-26",
      orders: 0,
      revenueCents: 0,
      rejected: 0,
    });
    expect(series[6]?.orders).toBe(3);
  });

  it("atravessa virada de mês", () => {
    expect(fillDays([], "2026-10-02", 3).map((d) => d.day)).toEqual([
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("ignora linhas fora da janela", () => {
    const series = fillDays(
      [{ day: "2026-09-01", orders: 9, revenueCents: 1, rejected: 0 }],
      "2026-09-29",
      7,
    );
    expect(series.every((d) => d.orders === 0)).toBe(true);
  });
});

describe("ticketCents", () => {
  it("arredonda para centavo inteiro", () => {
    expect(ticketCents(10000, 3)).toBe(3333);
  });

  it("é 0 sem pedidos", () => {
    expect(ticketCents(0, 0)).toBe(0);
  });
});
