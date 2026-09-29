import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Injectable, Logger } from "@nestjs/common";

import { Database } from "./database.js";

import type { OnModuleInit } from "@nestjs/common";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, "../../../db/init.sql");

/**
 * Aplica `db/init.sql` (idempotente) a cada boot, em `onModuleInit` — isto é,
 * antes do `listen`. Se falhar, `app.init()` rejeita e o boot cai, como antes.
 */
@Injectable()
export class MigrationsService implements OnModuleInit {
  private readonly logger = new Logger(MigrationsService.name);

  constructor(private readonly db: Database) {}

  async onModuleInit(): Promise<void> {
    const sql = await readFile(SCHEMA_PATH, "utf8");
    await this.db.withClientTransaction((client) => client.query(sql));
    this.logger.log("Schema aplicado (init.sql)");
  }
}
