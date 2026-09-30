import { Injectable } from "@nestjs/common";

import { Database } from "../../../common/database/database.js";
import { TenantDb } from "../../../common/database/tenantDb.js";
import type { TenantId } from "../../tenants/types/tenant.types.js";

export interface MenuLinkRow {
  code: string;
  tenantId: number;
  conversationId: number;
  expiresAt: Date;
}

interface LinkDbRow {
  code: string;
  tenant_id: number;
  conversation_id: number;
  expires_at: Date | string;
}

const toLink = (row: LinkDbRow): MenuLinkRow => ({
  code: row.code,
  tenantId: row.tenant_id,
  conversationId: row.conversation_id,
  expiresAt:
    row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at),
});

export const MENU_LINK_EVENTS = [
  "sent",
  "opened",
  "confirmed",
  "ordered",
] as const;

export type MenuLinkEvent = (typeof MENU_LINK_EVENTS)[number];

export interface MenuFunnel {
  sent: number;
  opened: number;
  confirmed: number;
  ordered: number;
}

@Injectable()
export class MenuLinkRepository {
  constructor(
    private readonly db: TenantDb,
    private readonly rawDb: Database,
  ) {}

  /**
   * Link AINDA válido desta conversa (o mais novo), para reaproveitar em vez de
   * criar outro a cada "quero pedir".
   */
  async findActiveMenuLink(
    tenantId: TenantId,
    conversationId: number,
  ): Promise<MenuLinkRow | null> {
    const result = await this.db.query<LinkDbRow>(
      tenantId,
      `SELECT code, tenant_id, conversation_id, expires_at
         FROM menu_links
        WHERE tenant_id = $1 AND conversation_id = $2 AND expires_at > NOW()
        ORDER BY expires_at DESC
        LIMIT 1`,
      [tenantId, conversationId],
    );
    const row = result.rows[0];
    return row ? toLink(row) : null;
  }

  /**
   * Grava o link. O `EXISTS` garante que a conversa é do tenant. `false` =
   * colisão de código (PK) ou conversa alheia: quem chama tenta outro código.
   */
  async insertMenuLink(
    tenantId: TenantId,
    conversationId: number,
    code: string,
    expiresAt: Date,
  ): Promise<boolean> {
    const result = await this.db.query(
      tenantId,
      `INSERT INTO menu_links (code, tenant_id, conversation_id, expires_at)
       SELECT $2, $1, $3, $4
        WHERE EXISTS (SELECT 1 FROM conversations WHERE id = $3 AND tenant_id = $1)
       ON CONFLICT (code) DO NOTHING`,
      [tenantId, code, conversationId, expiresAt.toISOString()],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Apaga links vencidos há mais de um dia (mantém os recentes: link vencido
   * responde "expirou", não "inválido"). Chamado ao criar um link.
   */
  async deleteStaleMenuLinks(tenantId: TenantId): Promise<void> {
    await this.db.query(
      tenantId,
      `DELETE FROM menu_links
        WHERE tenant_id = $1 AND expires_at < NOW() - INTERVAL '1 day'`,
      [tenantId],
    );
  }

  /**
   * Código → link. EXCEÇÃO deliberada à regra do `tenantId` primeiro (como
   * `findUserById`): é esta consulta que DESCOBRE o tenant a partir do código
   * da URL, então não há tenant para filtrar antes dela. O código aleatório de
   * 72 bits é a credencial; tudo depois usa o tenant da linha.
   */
  async findMenuLinkByCode(code: string): Promise<MenuLinkRow | null> {
    const result = await this.rawDb.query<LinkDbRow>(
      `SELECT code, tenant_id, conversation_id, expires_at
         FROM menu_links
        WHERE code = $1`,
      [code],
    );
    const row = result.rows[0];
    return row ? toLink(row) : null;
  }

  /**
   * Registra um passo do funil. O `EXISTS` garante que a conversa é do tenant:
   * id de outro tenant vira no-op em vez de gravar evento alheio.
   */
  async insertMenuLinkEvent(
    tenantId: TenantId,
    conversationId: number,
    event: MenuLinkEvent,
  ): Promise<void> {
    await this.db.query(
      tenantId,
      `INSERT INTO menu_link_events (tenant_id, conversation_id, event)
       SELECT $1, $2, $3
        WHERE EXISTS (SELECT 1 FROM conversations WHERE id = $2 AND tenant_id = $1)`,
      [tenantId, conversationId, event],
    );
  }

  /**
   * "Pedido feito" só conta para quem passou pelo link: grava `ordered` apenas
   * se a conversa já tem um `confirmed` (carrinho montado na página). Pedido
   * digitado no chat não entra no funil do cardápio.
   */
  async insertMenuLinkOrdered(
    tenantId: TenantId,
    conversationId: number,
  ): Promise<void> {
    await this.db.query(
      tenantId,
      `INSERT INTO menu_link_events (tenant_id, conversation_id, event)
       SELECT $1, $2, 'ordered'
        WHERE EXISTS (
          SELECT 1 FROM menu_link_events
           WHERE tenant_id = $1 AND conversation_id = $2 AND event = 'confirmed'
        )`,
      [tenantId, conversationId],
    );
  }

  /** Conversas DISTINTAS que chegaram a cada passo desde `since`. */
  async countMenuFunnel(tenantId: TenantId, since: Date): Promise<MenuFunnel> {
    const result = await this.db.query<{ event: MenuLinkEvent; total: string }>(
      tenantId,
      `SELECT event, COUNT(DISTINCT conversation_id) AS total
         FROM menu_link_events
        WHERE tenant_id = $1 AND created_at >= $2
        GROUP BY event`,
      [tenantId, since.toISOString()],
    );
    const funnel: MenuFunnel = { sent: 0, opened: 0, confirmed: 0, ordered: 0 };
    for (const row of result.rows) {
      if (row.event in funnel) funnel[row.event] = Number(row.total);
    }
    return funnel;
  }
}
