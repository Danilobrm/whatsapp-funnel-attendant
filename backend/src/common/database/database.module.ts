import { Global, Module } from "@nestjs/common";
import pg from "pg";

import { env } from "../../config/env.js";
import { Database, PG_POOL } from "./database.js";
import { MigrationsService } from "./migrations.service.js";
import { TenantDb } from "./tenantDb.js";

/**
 * Global: todo repository precisa do banco, e listar `DatabaseModule` em cada
 * módulo de negócio seria só ruído. O `Database` fecha o pool no shutdown.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => new pg.Pool({ connectionString: env.databaseUrl }),
    },
    Database,
    TenantDb,
    MigrationsService,
  ],
  exports: [Database, TenantDb],
})
export class DatabaseModule {}
