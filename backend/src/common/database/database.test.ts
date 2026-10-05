import { describe, expect, it, vi } from "vitest";

import { Database } from "./database.js";

import type { Pool } from "pg";

function fakePool() {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn().mockResolvedValue({ rows: [{ a: 1 }] }),
    connect: vi.fn().mockResolvedValue(client),
    end: vi.fn().mockResolvedValue(undefined),
  };
  return { pool, client, db: new Database(pool as unknown as Pool) };
}

describe("Database", () => {
  it("query delegates to the pool with text and params", async () => {
    const { pool, db } = fakePool();

    const res = await db.query("SELECT $1", [1]);

    expect(pool.query).toHaveBeenCalledWith("SELECT $1", [1]);
    expect(res.rows).toEqual([{ a: 1 }]);
  });

  describe("withClientTransaction", () => {
    it("BEGIN → fn → COMMIT and always releases the connection", async () => {
      const { client, db } = fakePool();

      const out = await db.withClientTransaction(async (c) => {
        await c.query("INSERT");
        return "ok";
      });

      expect(out).toBe("ok");
      expect(client.query.mock.calls.map((c) => c[0])).toEqual([
        "BEGIN",
        "INSERT",
        "COMMIT",
      ]);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it("ROLLBACK, rethrow and release when fn throws", async () => {
      const { client, db } = fakePool();

      await expect(
        db.withClientTransaction(async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      expect(client.query.mock.calls.map((c) => c[0])).toEqual([
        "BEGIN",
        "ROLLBACK",
      ]);
      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  it("closes the pool on module destroy", async () => {
    const { pool, db } = fakePool();

    await db.onModuleDestroy();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
