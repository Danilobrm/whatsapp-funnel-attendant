import { describe, expect, it } from "vitest";

import {
  describeHours,
  describeNextOpening,
  isOpenAt,
  nextOpening,
  type StoreHoursSettings,
} from "./store.hours.js";

function settings(
  overrides: Partial<StoreHoursSettings> = {},
): StoreHoursSettings {
  return {
    timezone: "America/Sao_Paulo",
    openingHours: {},
    paused: false,
    ...overrides,
  };
}

describe("isOpenAt", () => {
  it("intervalo normal — dentro, na borda de abertura e fora", () => {
    const s = settings({ openingHours: { mon: [["11:00", "15:00"]] } });

    // 2026-01-05 é segunda-feira. São Paulo = UTC-3 (sem horário de verão).
    expect(isOpenAt(s, new Date("2026-01-05T14:00:00Z"))).toBe(true); // 11:00 SP
    expect(isOpenAt(s, new Date("2026-01-05T13:59:00Z"))).toBe(false); // 10:59 SP
    expect(isOpenAt(s, new Date("2026-01-05T18:00:00Z"))).toBe(false); // 15:00 SP, fim exclusivo
  });

  it("dois intervalos no dia — cobre os dois e o vão entre eles", () => {
    const s = settings({
      openingHours: {
        mon: [
          ["11:00", "15:00"],
          ["18:00", "23:30"],
        ],
      },
    });

    expect(isOpenAt(s, new Date("2026-01-05T16:30:00Z"))).toBe(true); // 13:30 SP, 1º intervalo
    expect(isOpenAt(s, new Date("2026-01-05T19:00:00Z"))).toBe(false); // 16:00 SP, entre os dois
    expect(isOpenAt(s, new Date("2026-01-05T22:00:00Z"))).toBe(true); // 19:00 SP, 2º intervalo
  });

  it("intervalo cruzando meia-noite — hoje à noite e madrugada seguinte", () => {
    const s = settings({ openingHours: { fri: [["18:00", "02:00"]] } });

    // 2026-01-09 é sexta-feira.
    expect(isOpenAt(s, new Date("2026-01-10T02:00:00Z"))).toBe(true); // sex 23:00 SP
    expect(isOpenAt(s, new Date("2026-01-10T04:00:00Z"))).toBe(true); // sáb 01:00 SP
    expect(isOpenAt(s, new Date("2026-01-10T06:00:00Z"))).toBe(false); // sáb 03:00 SP, já fechou
  });

  it("dia fechado — sem entrada no mapa é sempre fechado", () => {
    const s = settings({ openingHours: { mon: [["11:00", "15:00"]] } });

    // 2026-01-06 é terça-feira, sem horário cadastrado.
    expect(isOpenAt(s, new Date("2026-01-06T14:00:00Z"))).toBe(false);
  });

  it("fuso diferente do servidor muda o resultado para o mesmo instante", () => {
    const openingHours = { mon: [["11:00", "15:00"]] as [string, string][] };
    const instant = new Date("2026-01-05T13:30:00Z");

    // SP (UTC-3): 10:30 — ainda fechado. Noronha (UTC-2): 11:30 — já aberto.
    expect(
      isOpenAt(
        settings({ timezone: "America/Sao_Paulo", openingHours }),
        instant,
      ),
    ).toBe(false);
    expect(
      isOpenAt(
        settings({ timezone: "America/Noronha", openingHours }),
        instant,
      ),
    ).toBe(true);
  });

  it("loja pausada fica fechada mesmo dentro do horário normal", () => {
    const s = settings({
      openingHours: { mon: [["11:00", "15:00"]] },
      paused: true,
    });

    expect(isOpenAt(s, new Date("2026-01-05T14:00:00Z"))).toBe(false);
  });
});

describe("nextOpening", () => {
  it("null quando já está aberta", () => {
    const s = settings({ openingHours: { mon: [["11:00", "15:00"]] } });
    expect(nextOpening(s, new Date("2026-01-05T14:00:00Z"))).toBeNull();
  });

  it("null quando pausada, mesmo com horário cadastrado", () => {
    const s = settings({
      openingHours: { mon: [["11:00", "15:00"]] },
      paused: true,
    });
    expect(nextOpening(s, new Date("2026-01-05T10:00:00Z"))).toBeNull();
  });

  it("acha a próxima abertura no mesmo dia", () => {
    const s = settings({ openingHours: { mon: [["11:00", "15:00"]] } });
    // 09:00 SP de segunda -> abre 11:00 SP mesmo dia -> 14:00Z.
    const next = nextOpening(s, new Date("2026-01-05T12:00:00Z"));
    expect(next?.toISOString()).toBe("2026-01-05T14:00:00.000Z");
  });

  it("pula para o próximo dia com horário quando hoje já fechou", () => {
    const s = settings({
      openingHours: { mon: [["11:00", "15:00"]], wed: [["11:00", "15:00"]] },
    });
    // Segunda às 20:00 SP (23:00Z) -> próxima abertura é quarta 11:00 SP.
    const next = nextOpening(s, new Date("2026-01-05T23:00:00Z"));
    expect(next?.toISOString()).toBe("2026-01-07T14:00:00.000Z");
  });

  it("null quando não há nenhum horário cadastrado", () => {
    const s = settings({ openingHours: {} });
    expect(nextOpening(s, new Date("2026-01-05T12:00:00Z"))).toBeNull();
  });
});

describe("describeHours", () => {
  it("agrupa dias consecutivos com o mesmo horário", () => {
    const s = settings({
      openingHours: {
        mon: [
          ["11:00", "15:00"],
          ["18:00", "23:30"],
        ],
        tue: [
          ["11:00", "15:00"],
          ["18:00", "23:30"],
        ],
        wed: [
          ["11:00", "15:00"],
          ["18:00", "23:30"],
        ],
        thu: [
          ["11:00", "15:00"],
          ["18:00", "23:30"],
        ],
        fri: [
          ["11:00", "15:00"],
          ["18:00", "23:30"],
        ],
        sat: [["18:00", "23:30"]],
        sun: [["18:00", "23:30"]],
      },
    });

    expect(describeHours(s)).toBe(
      "Seg a Sex 11h às 15h e 18h às 23h30. Sáb e Dom 18h às 23h30",
    );
  });

  it("sem nenhum horário cadastrado", () => {
    expect(describeHours(settings())).toBe("Fechado todos os dias");
  });
});

describe("describeNextOpening", () => {
  const TZ = "America/Sao_Paulo";
  // 2026-09-29 (terça) 19:00 em São Paulo = 22:00 UTC
  const FROM = new Date("2026-09-29T22:00:00.000Z");

  it("says 'hoje' for the same day in the store timezone", () => {
    const next = new Date("2026-09-30T01:30:00.000Z"); // 22:30 SP, ainda terça
    expect(describeNextOpening(next, FROM, TZ)).toBe("hoje às 22h30");
  });

  it("says 'amanhã' for the next store day, even when UTC is still the same day", () => {
    const next = new Date("2026-09-30T14:00:00.000Z"); // quarta 11:00 SP
    expect(describeNextOpening(next, FROM, TZ)).toBe("amanhã às 11h");
  });

  it("uses the weekday name beyond tomorrow", () => {
    const next = new Date("2026-10-02T21:00:00.000Z"); // sexta 18:00 SP
    expect(describeNextOpening(next, FROM, TZ)).toBe("sexta-feira às 18h");
  });

  // 00:30 UTC de quarta ainda é a noite de terça em São Paulo.
  it("compares days in the STORE timezone, not in UTC", () => {
    const next = new Date("2026-09-30T00:30:00.000Z"); // terça 21:30 SP
    expect(describeNextOpening(next, FROM, TZ)).toBe("hoje às 21h30");
  });
});
