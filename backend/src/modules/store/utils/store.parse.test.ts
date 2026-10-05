import { describe, expect, it } from "vitest";

import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import { parseStoreSettings } from "./store.parse.js";

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
    [
      { ...VALID_INPUT, restaurantName: "x".repeat(121) },
      "restaurant_name_too_long",
    ],
    [{ ...VALID_INPUT, contactEmail: "fulano@" }, "email_invalid"],
    [{ ...VALID_INPUT, contactEmail: "a b@c.com" }, "email_invalid"],
    [{ ...VALID_INPUT, address: "x".repeat(301) }, "address_too_long"],
    [{ ...VALID_INPUT, latitude: null }, "location_invalid"],
    [{ ...VALID_INPUT, latitude: 91 }, "location_invalid"],
    [{ ...VALID_INPUT, longitude: "-47" }, "location_invalid"],
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

describe("parseStoreSettings — informações do restaurante", () => {
  it("apara os textos e guarda nome, foto, e-mail e endereço", () => {
    expect(
      parseStoreSettings({
        ...VALID_INPUT,
        restaurantName: "  Pizzaria Demo  ",
      }),
    ).toMatchObject({
      restaurantName: "Pizzaria Demo",
      logoUrl: "/produtos/logo.png",
      contactEmail: "contato@pizzaria.com",
      address: "Rua 1, 100 - Centro, Luziânia - GO",
      latitude: -16.2525,
      longitude: -47.9503,
    });
  });

  it("vazio ou ausente vira null (campos opcionais)", () => {
    const {
      restaurantName: _n,
      logoUrl: _l,
      contactEmail: _e,
      address: _a,
      latitude: _lat,
      longitude: _lng,
      ...legacy
    } = VALID_INPUT;
    expect(
      parseStoreSettings({ ...legacy, contactEmail: "   " }),
    ).toMatchObject({
      restaurantName: null,
      logoUrl: null,
      contactEmail: null,
      address: null,
      latitude: null,
      longitude: null,
    });
  });
});

describe("parseStoreSettings — número do atendimento", () => {
  it("guarda só os dígitos (aceita o formato colado do WhatsApp)", () => {
    expect(
      parseStoreSettings({
        ...VALID_INPUT,
        whatsappNumber: "+55 (61) 99999-0000",
      }),
    ).toMatchObject({ whatsappNumber: "5561999990000" });
  });

  it("vazio, ausente ou só espaços vira null", () => {
    expect(
      parseStoreSettings({ ...VALID_INPUT, whatsappNumber: "  " })
        .whatsappNumber,
    ).toBeNull();
    expect(
      parseStoreSettings({ ...VALID_INPUT, whatsappNumber: null })
        .whatsappNumber,
    ).toBeNull();
    expect(parseStoreSettings(VALID_INPUT).whatsappNumber).toBeNull();
  });

  it.each(["12345", "abc", "1".repeat(16), "+55 61"])(
    "recusa %j com whatsapp_number_invalid",
    (whatsappNumber) => {
      expect(() =>
        parseStoreSettings({ ...VALID_INPUT, whatsappNumber }),
      ).toThrowError(
        expect.objectContaining({
          code: "whatsapp_number_invalid",
          field: "whatsappNumber",
        }),
      );
    },
  );
});
