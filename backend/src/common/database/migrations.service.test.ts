import { describe, expect, it, vi } from "vitest";

import { MigrationsService } from "./migrations.service.js";

import type { PoolClient } from "pg";
import type { Database } from "./database.js";

describe("MigrationsService", () => {
  it("applies db/init.sql inside ONE transaction on module init", async () => {
    const client = { query: vi.fn().mockResolvedValue({}) };
    const db = {
      withClientTransaction: vi.fn(
        async (fn: (c: PoolClient) => Promise<unknown>) =>
          fn(client as unknown as PoolClient),
      ),
    };

    await new MigrationsService(db as unknown as Database).onModuleInit();

    expect(db.withClientTransaction).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(String(client.query.mock.calls[0]?.[0])).toContain(
      "CREATE TABLE IF NOT EXISTS",
    );
  });

  it("makes boot fail when the schema cannot be applied", async () => {
    const db = {
      withClientTransaction: vi
        .fn()
        .mockRejectedValue(new Error("syntax error")),
    };

    await expect(
      new MigrationsService(db as unknown as Database).onModuleInit(),
    ).rejects.toThrow("syntax error");
  });
});
