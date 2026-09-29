import { pool } from "./db.js";
import { assertTenantScoped } from "./tenantQuery.js";

import type { PoolClient, QueryResultRow } from "pg";
import type { TenantId } from "../modules/tenants/types/tenant.types.js";

/** BEGIN → fn → COMMIT, ou ROLLBACK se `fn` lançar. A conexão sempre volta ao pool. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * `client.query()` tenant-scoped, para dentro de `withTransaction`.
 * `tenantQuery()` não serve aqui porque ela chama o `query()` do pool, não a
 * conexão presa da transação — mas a validação (`assertTenantScoped`) é a
 * mesma rede de segurança contra query sem filtro de tenant ou com o
 * `tenantId` errado.
 */
export function clientTenantQuery<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  tenantId: TenantId,
  sql: string,
  params: unknown[],
) {
  assertTenantScoped(tenantId, sql, params);
  return client.query<T>(sql, params as never[]);
}
