import { describe, expect, it } from "vitest";

import { startOfDayInZone } from "./order.time.js";

describe("startOfDayInZone", () => {
  it("meia-noite de São Paulo (UTC-3) é 03:00 UTC", () => {
    const now = new Date("2026-09-29T15:00:00.000Z");
    expect(startOfDayInZone(now, "America/Sao_Paulo").toISOString()).toBe(
      "2026-09-29T03:00:00.000Z",
    );
  });

  it("às 22h em São Paulo (01h UTC do dia seguinte) ainda é o dia da loja", () => {
    const now = new Date("2026-09-30T01:00:00.000Z");
    expect(startOfDayInZone(now, "America/Sao_Paulo").toISOString()).toBe(
      "2026-09-29T03:00:00.000Z",
    );
  });

  it("às 00h30 em São Paulo já é o dia novo", () => {
    const now = new Date("2026-09-30T03:30:00.000Z");
    expect(startOfDayInZone(now, "America/Sao_Paulo").toISOString()).toBe(
      "2026-09-30T03:00:00.000Z",
    );
  });

  it("UTC devolve a meia-noite UTC", () => {
    const now = new Date("2026-09-29T15:45:12.345Z");
    expect(startOfDayInZone(now, "UTC").toISOString()).toBe(
      "2026-09-29T00:00:00.000Z",
    );
  });
});
