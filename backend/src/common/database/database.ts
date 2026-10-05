import { Inject, Injectable } from "@nestjs/common";

import type { OnModuleDestroy } from "@nestjs/common";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

/** Token do `pg.Pool` — o `DatabaseModule` o fabrica; teste passa um falso. */
export const PG_POOL = Symbol("PG_POOL");

/**
 * Acesso ao Postgres para o que NÃO é tenant-scoped (login, resolver tenant
 * pelo phone_number_id, link do cardápio por código, healthcheck) e base do
 * `TenantDb`. Repository de dados de tenant não usa esta classe direto: usa o
 * `TenantDb`, que valida o filtro de tenant antes de rodar.
 */
@Injectable()
export class Database implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params as never);
  }

  connect(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /** BEGIN → fn → COMMIT, ou ROLLBACK se `fn` lançar. A conexão sempre volta ao pool. */
  async withClientTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
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

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
