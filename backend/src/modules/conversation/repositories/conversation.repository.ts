import { tenantQuery } from "../../../config/tenantQuery.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type {
  Channel,
  HistoryMessage,
  MessageDirection,
} from "../types/conversation.types.js";

interface ConversationRow {
  id: number;
  previous_message_at: Date | string | null;
}

export interface ConversationRef {
  id: number;
  /** `last_message_at` ANTES desta mensagem. `null` = conversa nova. */
  previousMessageAt: Date | null;
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Cria ou toca a conversa e devolve quando foi a mensagem anterior.
 *
 * A CTE `prev` lê o estado ANTES do upsert (Postgres avalia todas as partes do
 * WITH sobre o mesmo snapshot), então `previous_message_at` é o valor antigo —
 * é o que diz ao serviço se a conversa está começando ou em andamento.
 */
export async function upsertConversation(
  tenantId: TenantId,
  channel: Channel,
  contact: string,
  contactName: string | null,
): Promise<ConversationRef> {
  const result = await tenantQuery<ConversationRow>(
    tenantId,
    `WITH prev AS (
       SELECT last_message_at
         FROM conversations
        WHERE tenant_id = $1 AND channel = $2 AND contact = $3
     )
     INSERT INTO conversations (tenant_id, channel, contact, contact_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, channel, contact) DO UPDATE
        SET last_message_at = CURRENT_TIMESTAMP,
            contact_name = COALESCE(EXCLUDED.contact_name, conversations.contact_name)
     RETURNING id, (SELECT last_message_at FROM prev) AS previous_message_at`,
    [tenantId, channel, contact, contactName],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Falha ao registrar a conversa");
  return { id: row.id, previousMessageAt: toDate(row.previous_message_at) };
}

/**
 * Registra uma mensagem. Devolve `false` quando o `externalId` já existe para
 * o tenant — é o sinal de reenvio do canal, e quem chama NÃO deve responder.
 *
 * O `EXISTS` garante que `conversationId` pertence ao tenant: um id de outro
 * tenant vira no-op em vez de gravar mensagem na conversa alheia.
 */
export async function insertMessage(
  tenantId: TenantId,
  conversationId: number,
  direction: MessageDirection,
  body: string,
  externalId: string | null,
): Promise<boolean> {
  const result = await tenantQuery<{ id: string }>(
    tenantId,
    `INSERT INTO messages (tenant_id, conversation_id, direction, body, external_id)
     SELECT $1, $2, $3, $4, $5
      WHERE EXISTS (SELECT 1 FROM conversations WHERE id = $2 AND tenant_id = $1)
     ON CONFLICT (tenant_id, external_id) WHERE external_id IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [tenantId, conversationId, direction, body, externalId],
  );

  return (result.rowCount ?? 0) > 0;
}

interface MessageRow {
  direction: MessageDirection;
  body: string;
  created_at: Date | string;
}

/** Últimas `limit` mensagens, em ordem cronológica (mais antiga primeiro). */
export async function findRecentMessages(
  tenantId: TenantId,
  conversationId: number,
  limit: number,
): Promise<HistoryMessage[]> {
  const result = await tenantQuery<MessageRow>(
    tenantId,
    `SELECT direction, body, created_at
       FROM (
         SELECT direction, body, created_at, id
           FROM messages
          WHERE tenant_id = $1 AND conversation_id = $2
          ORDER BY created_at DESC, id DESC
          LIMIT $3
       ) recent
      ORDER BY created_at ASC, id ASC`,
    [tenantId, conversationId, limit],
  );

  return result.rows.map((row) => ({
    direction: row.direction,
    body: row.body,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  }));
}

/** Id da conversa de um contato, sem criá-la. `null` = nunca conversou. */
export async function findConversationId(
  tenantId: TenantId,
  channel: Channel,
  contact: string,
): Promise<number | null> {
  const result = await tenantQuery<{ id: number }>(
    tenantId,
    `SELECT id FROM conversations
      WHERE tenant_id = $1 AND channel = $2 AND contact = $3`,
    [tenantId, channel, contact],
  );
  return result.rows[0]?.id ?? null;
}

/** Histórico de um contato sem criar a conversa (leitura do simulador). */
export async function findMessagesByContact(
  tenantId: TenantId,
  channel: Channel,
  contact: string,
  limit: number,
): Promise<HistoryMessage[]> {
  const result = await tenantQuery<{ id: number }>(
    tenantId,
    `SELECT id FROM conversations
      WHERE tenant_id = $1 AND channel = $2 AND contact = $3`,
    [tenantId, channel, contact],
  );

  const row = result.rows[0];
  if (!row) return [];
  return findRecentMessages(tenantId, row.id, limit);
}

/** Apaga a conversa (e as mensagens, por cascata). Usado pelo simulador. */
export async function deleteConversation(
  tenantId: TenantId,
  channel: Channel,
  contact: string,
): Promise<void> {
  await tenantQuery(
    tenantId,
    `DELETE FROM conversations
      WHERE tenant_id = $1 AND channel = $2 AND contact = $3`,
    [tenantId, channel, contact],
  );
}

export interface ConversationTarget {
  channel: Channel;
  contact: string;
  /** `tenants.whatsapp_phone_number_id` — de qual número a loja responde. */
  whatsappPhoneNumberId: string | null;
}

/** Para onde mandar uma mensagem ativa (`sendOutbound`). `null` = conversa não é deste tenant. */
export async function findConversationTarget(
  tenantId: TenantId,
  conversationId: number,
): Promise<ConversationTarget | null> {
  const result = await tenantQuery<{
    channel: Channel;
    contact: string;
    whatsapp_phone_number_id: string | null;
  }>(
    tenantId,
    `SELECT c.channel, c.contact, t.whatsapp_phone_number_id
       FROM conversations c
       JOIN tenants t ON t.id = c.tenant_id
      WHERE c.tenant_id = $1 AND c.id = $2`,
    [tenantId, conversationId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    channel: row.channel,
    contact: row.contact,
    whatsappPhoneNumberId: row.whatsapp_phone_number_id,
  };
}
