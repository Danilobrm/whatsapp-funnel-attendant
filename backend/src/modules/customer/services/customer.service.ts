import { upsertCustomer } from "../repositories/customer.repository.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { Channel } from "../../conversation/types/conversation.types.js";
import type { Customer } from "../types/customer.types.js";

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

/**
 * Garante o cliente da conversa (criado/atualizado a cada mensagem). Falha
 * aqui NUNCA derruba a resposta ao cliente: sem cadastro o agente só perde o
 * contexto de cliente recorrente.
 */
export async function resolveCustomer(
  tenantId: TenantId,
  channel: Channel,
  contact: string,
  contactName: string | null,
): Promise<Customer | null> {
  try {
    return await upsertCustomer(
      tenantId,
      customerPhoneFor(channel, contact),
      contactName,
    );
  } catch (err) {
    console.error(
      "Falha ao registrar o cliente:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
