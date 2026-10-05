import { describe, expect, it } from "vitest";

import { parseWebhookPayload } from "./whatsapp.payload.js";

function webhook(value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5511900000000",
                phone_number_id: "1234567890",
              },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

describe("parseWebhookPayload", () => {
  it("extracts a text message with the contact name", () => {
    const body = webhook({
      contacts: [{ wa_id: "5511988887777", profile: { name: "Maria" } }],
      messages: [
        {
          from: "5511988887777",
          id: "wamid.ABC",
          timestamp: "1727550000",
          type: "text",
          text: { body: "quero uma pizza" },
        },
      ],
    });

    expect(parseWebhookPayload(body)).toEqual([
      {
        phoneNumberId: "1234567890",
        from: "5511988887777",
        contactName: "Maria",
        messageId: "wamid.ABC",
        type: "text",
        text: "quero uma pizza",
        location: null,
      },
    ]);
  });

  it("keeps non-text messages with text null", () => {
    const body = webhook({
      messages: [
        { from: "5511988887777", id: "wamid.AUD", type: "audio", audio: {} },
      ],
    });

    expect(parseWebhookPayload(body)).toEqual([
      expect.objectContaining({ type: "audio", text: null, contactName: null }),
    ]);
  });

  // Status de entrega/leitura chegam pelo mesmo webhook e não são mensagens.
  it("ignores status-only notifications", () => {
    const body = webhook({
      statuses: [{ id: "wamid.X", status: "read", recipient_id: "55119" }],
    });

    expect(parseWebhookPayload(body)).toEqual([]);
  });

  it.each([
    ["corpo nulo", null],
    ["outro objeto", { object: "page", entry: [] }],
    ["entry não-lista", { object: "whatsapp_business_account", entry: {} }],
    [
      "mensagem sem id",
      webhook({
        messages: [{ from: "55", type: "text", text: { body: "x" } }],
      }),
    ],
    [
      "sem phone_number_id",
      {
        object: "whatsapp_business_account",
        entry: [{ changes: [{ field: "messages", value: { metadata: {} } }] }],
      },
    ],
  ])("never throws on malformed input: %s", (_label, body) => {
    expect(parseWebhookPayload(body)).toEqual([]);
  });

  it("extracts the coordinates of a location message", () => {
    const body = webhook({
      messages: [
        {
          from: "5511988887777",
          id: "wamid.LOC",
          type: "location",
          location: { latitude: -16.25, longitude: -47.95, name: "Loja" },
        },
      ],
    });

    expect(parseWebhookPayload(body)[0]).toMatchObject({
      type: "location",
      text: null,
      location: { latitude: -16.25, longitude: -47.95 },
    });
  });

  it("drops out-of-range or non-numeric coordinates", () => {
    for (const location of [
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: -181 },
      { latitude: "1", longitude: 2 },
      {},
    ]) {
      const body = webhook({
        messages: [
          { from: "5511988887777", id: "wamid.X", type: "location", location },
        ],
      });
      expect(parseWebhookPayload(body)[0]?.location).toBeNull();
    }
  });
});
