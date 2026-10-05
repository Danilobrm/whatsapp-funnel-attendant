/**
 * Extração das mensagens de um webhook da WhatsApp Cloud API.
 *
 * Forma relevante do payload (o resto é ignorado):
 *
 *   { object: "whatsapp_business_account",
 *     entry: [{ changes: [{ field: "messages", value: {
 *       metadata: { phone_number_id },
 *       contacts: [{ wa_id, profile: { name } }],
 *       messages: [{ from, id, timestamp, type, text?: { body },
 *                    location?: { latitude, longitude, name?, address? } }],
 *       statuses: [...]   // entregue/lido — ignorado aqui
 *     }}]}]}
 *
 * Puro e defensivo: o corpo vem de fora, então nada é assumido — campo
 * ausente ou com tipo errado descarta aquele item, nunca lança.
 */
export interface WhatsAppInboundMessage {
  /** Identifica o restaurante (tenant). */
  phoneNumberId: string;
  /** wa_id do cliente — para onde a resposta vai. */
  from: string;
  contactName: string | null;
  /** wamid.* — chave de deduplicação. */
  messageId: string;
  /** "text", "audio", "image", "location", "interactive"... */
  type: string;
  /** Presente só quando `type === "text"`. */
  text: string | null;
  /** Presente só quando `type === "location"` com coordenadas válidas. */
  location: { latitude: number; longitude: number } | null;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asCoordinate(value: unknown, limit: number): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= limit
    ? value
    : null;
}

function contactNames(value: Json): Map<string, string> {
  const names = new Map<string, string>();
  for (const contact of asArray(value.contacts)) {
    if (!isObject(contact)) continue;
    const waId = asString(contact.wa_id);
    const name = isObject(contact.profile)
      ? asString(contact.profile.name)
      : null;
    if (waId && name) names.set(waId, name);
  }
  return names;
}

export function parseWebhookPayload(body: unknown): WhatsAppInboundMessage[] {
  if (!isObject(body) || body.object !== "whatsapp_business_account") return [];

  const out: WhatsAppInboundMessage[] = [];

  for (const entry of asArray(body.entry)) {
    if (!isObject(entry)) continue;

    for (const change of asArray(entry.changes)) {
      if (!isObject(change) || change.field !== "messages") continue;
      const value = change.value;
      if (!isObject(value) || !isObject(value.metadata)) continue;

      const phoneNumberId = asString(value.metadata.phone_number_id);
      if (!phoneNumberId) continue;

      const names = contactNames(value);

      for (const message of asArray(value.messages)) {
        if (!isObject(message)) continue;
        const from = asString(message.from);
        const messageId = asString(message.id);
        const type = asString(message.type);
        if (!from || !messageId || !type) continue;

        const text =
          type === "text" && isObject(message.text)
            ? asString(message.text.body)
            : null;

        let location: WhatsAppInboundMessage["location"] = null;
        if (type === "location" && isObject(message.location)) {
          const latitude = asCoordinate(message.location.latitude, 90);
          const longitude = asCoordinate(message.location.longitude, 180);
          if (latitude !== null && longitude !== null) {
            location = { latitude, longitude };
          }
        }

        out.push({
          phoneNumberId,
          from,
          contactName: names.get(from) ?? null,
          messageId,
          type,
          text,
          location,
        });
      }
    }
  }

  return out;
}
