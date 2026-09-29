import { Inject, Injectable } from "@nestjs/common";

import { Database } from "./database.js";
import { assertTenantScoped } from "./tenantScope.js";

import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import type { TenantId } from "../../modules/tenants/types/tenant.types.js";

/**
 * `client.query()` tenant-scoped, para dentro de `TenantDb.withTransaction`.
 * O `TenantDb.query` não serve aqui porque usa o pool, não a conexão presa da
 * transação — mas a validação é a mesma rede de segurança contra query sem
 * filtro de tenant ou com o `tenantId` errado.
 */
export class TenantTx {
  constructor(private readonly client: PoolClient) {}

  query<T extends QueryResultRow = QueryResultRow>(
    tenantId: TenantId,
    sql: string,
    params: unknown[],
  ): Promise<QueryResult<T>> {
    assertTenantScoped(tenantId, sql, params);
    return this.client.query<T>(sql, params as never[]);
  }
}

/**
 * ÚNICA porta de entrada de SQL de dados de tenant. Mesma assinatura de
 * `Database.query`, mas com `tenantId` explícito na frente e validado por
 * `assertTenantScoped` antes de rodar — é o backstop de runtime do
 * multi-tenancy (`CLAUDE.md`), agora injetado em cada repository.
 */
@Injectable()
export class TenantDb {
  constructor(@Inject(Database) private readonly db: Database) {}

  // `async` de propósito: a violação chega como REJEIÇÃO (o `tenantQuery` de
  // antes também era assim), não como exceção síncrona a quem não deu `await`.
  async query<T extends QueryResultRow = QueryResultRow>(
    tenantId: TenantId,
    sql: string,
    params: unknown[],
  ): Promise<QueryResult<T>> {
    assertTenantScoped(tenantId, sql, params);
    return this.db.query<T>(sql, params);
  }

  withTransaction<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.db.withClientTransaction((client) => fn(new TenantTx(client)));
  }
}
