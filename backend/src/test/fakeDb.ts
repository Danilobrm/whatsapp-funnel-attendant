import { Database } from "../common/database/database.js";
import { TenantDb } from "../common/database/tenantDb.js";

import type { Pool, PoolClient } from "pg";

/**
 * `TenantDb` REAL (com o backstop de tenant) sobre um pool falso. Os testes de
 * repository inspecionam `query`/`clientQuery` como sempre, e continuam
 * exercitando o `assertTenantScoped` de verdade.
 *
 * - `query`: chamadas fora de transação (`pool.query`).
 * - `clientQuery`: chamadas dentro de `withTransaction` (`client.query`),
 *   incluindo o BEGIN/COMMIT/ROLLBACK que o `Database` emite.
 */
export function fakeTenantDb(
  query: (...args: unknown[]) => unknown,
  clientQuery: (...args: unknown[]) => unknown = () => ({ rows: [] }),
) {
  const client = { query: clientQuery, release: () => {} };
  const pool = {
    query,
    connect: async () => client as unknown as PoolClient,
  } as unknown as Pool;
  const database = new Database(pool);
  return { database, tenantDb: new TenantDb(database) };
}
