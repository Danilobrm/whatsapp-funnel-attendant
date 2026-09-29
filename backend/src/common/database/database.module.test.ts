import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import { Database, PG_POOL } from "./database.js";
import { DatabaseModule } from "./database.module.js";
import { MigrationsService } from "./migrations.service.js";
import { TenantDb } from "./tenantDb.js";

describe("DatabaseModule", () => {
  it("wires Database and TenantDb by constructor TYPE, and closes the pool on shutdown", async () => {
    const pool = { end: vi.fn().mockResolvedValue(undefined), query: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(MigrationsService)
      .useValue({ onModuleInit: vi.fn() })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const db = app.get(Database);
    const tenantDb = app.get(TenantDb);
    expect(db).toBeInstanceOf(Database);
    expect(tenantDb).toBeInstanceOf(TenantDb);

    await app.close();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
