import { describe, expect, it, vi } from "vitest";

import { asTenantId } from "../../modules/tenants/types/tenant.types.js";
import { TenantDb, TenantTx } from "./tenantDb.js";

import type { PoolClient } from "pg";
import type { Database } from "./database.js";

const TENANT = asTenantId(7);
const OTHER_TENANT = asTenantId(9);

function setup() {
  const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
  const database = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    withClientTransaction: vi.fn(
      async (fn: (c: PoolClient) => Promise<unknown>) =>
        fn(client as unknown as PoolClient),
    ),
  };
  return {
    client,
    database,
    db: new TenantDb(database as unknown as Database),
  };
}

describe("TenantDb.query", () => {
  it("delega para o Database quando a validação passa", async () => {
    const { database, db } = setup();

    await db.query(TENANT, "SELECT * FROM x WHERE tenant_id = $1", [TENANT]);

    expect(database.query).toHaveBeenCalledWith(
      "SELECT * FROM x WHERE tenant_id = $1",
      [TENANT],
    );
  });

  it("nunca chega ao banco quando o SQL não tem tenant_id", async () => {
    const { database, db } = setup();

    await expect(
      db.query(TENANT, "SELECT * FROM x WHERE id = $1", [TENANT]),
    ).rejects.toThrow(/não referencia tenant_id/);

    expect(database.query).not.toHaveBeenCalled();
  });

  it("nunca chega ao banco com o tenantId errado", async () => {
    const { database, db } = setup();

    await expect(
      db.query(TENANT, "SELECT * FROM x WHERE tenant_id = $1", [OTHER_TENANT]),
    ).rejects.toThrow(/primeiro parâmetro vinculado/);

    expect(database.query).not.toHaveBeenCalled();
  });
});

describe("TenantDb.withTransaction / TenantTx.query", () => {
  it("entrega um TenantTx que roda na conexão presa da transação", async () => {
    const { client, database, db } = setup();

    await db.withTransaction(async (tx) => {
      expect(tx).toBeInstanceOf(TenantTx);
      await tx.query(TENANT, "UPDATE x SET a = 1 WHERE tenant_id = $1", [
        TENANT,
      ]);
    });

    expect(client.query).toHaveBeenCalledWith(
      "UPDATE x SET a = 1 WHERE tenant_id = $1",
      [TENANT],
    );
    expect(database.query).not.toHaveBeenCalled();
  });

  it("dentro da transação também barra SQL sem tenant_id e tenantId trocado", async () => {
    const { client, db } = setup();

    await db.withTransaction(async (tx) => {
      expect(() =>
        tx.query(TENANT, "UPDATE x SET a = 1 WHERE id = $1", [TENANT]),
      ).toThrow(/não referencia tenant_id/);
      expect(() =>
        tx.query(TENANT, "UPDATE x SET a = 1 WHERE tenant_id = $1", [
          OTHER_TENANT,
        ]),
      ).toThrow(/primeiro parâmetro vinculado/);
    });

    expect(client.query).not.toHaveBeenCalled();
  });

  it("propaga a falha de fn (o Database é quem faz o ROLLBACK)", async () => {
    const { db } = setup();

    await expect(
      db.withTransaction(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
