import { Injectable } from "@nestjs/common";

import { TenantDb } from "../../../common/database/tenantDb.js";
import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { CartAddress } from "../../order/types/cart.types.js";
import type { Customer } from "../types/customer.types.js";

interface CustomerRow {
  id: number;
  phone: string;
  name: string | null;
  last_address: CartAddress | null;
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    lastAddress: row.last_address,
  };
}

@Injectable()
export class CustomerRepository {
  constructor(private readonly db: TenantDb) {}

  /**
   * Cria o cliente ou atualiza o nome (só quando chega um nome novo — um nome
   * vazio nunca apaga o que já se sabe). Um por telefone e por tenant.
   */
  async upsertCustomer(
    tenantId: TenantId,
    phone: string,
    name: string | null,
  ): Promise<Customer> {
    const result = await this.db.query<CustomerRow>(
      tenantId,
      `INSERT INTO customers (tenant_id, phone, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, phone) DO UPDATE
          SET name = COALESCE(EXCLUDED.name, customers.name)
       RETURNING id, phone, name, last_address`,
      [tenantId, phone, name],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Falha ao registrar o cliente");
    return toCustomer(row);
  }

  async updateCustomerLastAddress(
    tenantId: TenantId,
    customerId: number,
    address: CartAddress,
  ): Promise<void> {
    await this.db.query(
      tenantId,
      `UPDATE customers SET last_address = $3
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, customerId, JSON.stringify(address)],
    );
  }

  /** Clientes de teste do simulador: telefone fictício, conversa `sim-<telefone>`. */
  async listSimulatedCustomers(tenantId: TenantId): Promise<Customer[]> {
    const result = await this.db.query<CustomerRow>(
      tenantId,
      `SELECT cu.id, cu.phone, cu.name, cu.last_address
         FROM customers cu
         JOIN conversations c
           ON c.tenant_id = cu.tenant_id
          AND c.channel = 'simulator'
          AND c.contact = 'sim-' || cu.phone
        WHERE cu.tenant_id = $1
        ORDER BY cu.name NULLS LAST, cu.id`,
      [tenantId],
    );
    return result.rows.map(toCustomer);
  }
}
