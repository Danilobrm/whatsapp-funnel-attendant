import { Injectable } from "@nestjs/common";

import { Database } from "../../../common/database/database.js";
import { asTenantId } from "../types/tenant.types.js";

import type { Tenant, TenantId } from "../types/tenant.types.js";

interface TenantRow {
  id: number;
  slug: string;
  name: string;
}

function toTenant(row: TenantRow): Tenant {
  return { id: asTenantId(row.id), slug: row.slug, name: row.name };
}

@Injectable()
export class TenantRepository {
  constructor(private readonly db: Database) {}

  /**
   * Não usa `TenantDb`: esta é a tabela `tenants` em si — `id` já É o
   * `tenant_id`, não existe coluna `tenant_id` pra filtrar contra. Não há o que
   * vazar entre tenants numa busca pela própria chave primária deles.
   */
  async findTenantById(tenantId: TenantId): Promise<Tenant | null> {
    const result = await this.db.query<TenantRow>(
      `SELECT id, slug, name FROM tenants WHERE id = $1`,
      [tenantId],
    );

    const row = result.rows[0];
    return row ? toTenant(row) : null;
  }

  /**
   * Resolve o tenant pelo `phone_number_id` da Meta — o identificador que chega
   * em todo webhook (`metadata.phone_number_id`). NÃO é o número de telefone em
   * si: é o id do número dentro da conta WhatsApp Business.
   *
   * Exceção deliberada à regra "tenantId é o primeiro argumento": aqui o tenant
   * ainda não é conhecido — é exatamente isto que o descobre.
   */
  async findTenantByWhatsAppPhoneNumberId(
    phoneNumberId: string,
  ): Promise<Tenant | null> {
    const result = await this.db.query<TenantRow>(
      `SELECT id, slug, name FROM tenants WHERE whatsapp_phone_number_id = $1`,
      [phoneNumberId],
    );

    const row = result.rows[0];
    return row ? toTenant(row) : null;
  }
}
