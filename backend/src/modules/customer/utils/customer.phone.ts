import type { Channel } from "../../conversation/types/conversation.types.js";

/**
 * Telefone do cliente a partir do contato da conversa. WhatsApp: o próprio
 * wa_id. Simulador: `sim-<telefone>` (cliente de teste) → o telefone fictício;
 * o cliente padrão do admin (`admin-<id>`) fica com o contato como "telefone".
 */
export function customerPhoneFor(channel: Channel, contact: string): string {
  if (channel === "simulator" && contact.startsWith("sim-")) {
    return contact.slice("sim-".length);
  }
  return contact;
}
