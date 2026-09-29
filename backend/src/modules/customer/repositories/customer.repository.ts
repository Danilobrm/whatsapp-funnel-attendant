import { tenantQuery } from "../../../config/tenantQuery.js";

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

/**
 * Cria o cliente ou atualiza o nome (só quando chega um nome novo — um nome
 * vazio nunca apaga o que já se sabe). Um por telefone e por tenant.
 */
export async function upsertCustomer(
  tenantId: TenantId,
  phone: string,
  name: string | null,
): Promise<Customer> {
  const result = await tenantQuery<CustomerRow>(
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

export async function updateCustomerLastAddress(
  tenantId: TenantId,
  customerId: number,
  address: CartAddress,
): Promise<void> {
  await tenantQuery(
    tenantId,
    `UPDATE customers SET last_address = $3
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, customerId, JSON.stringify(address)],
  );
}

/** Clientes de teste do simulador: telefone fictício, conversa `sim-<telefone>`. */
export async function listSimulatedCustomers(
  tenantId: TenantId,
): Promise<Customer[]> {
  const result = await tenantQuery<CustomerRow>(
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
