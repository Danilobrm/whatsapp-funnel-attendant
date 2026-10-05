import { Injectable, Logger } from "@nestjs/common";

import { Database } from "../../../common/database/database.js";

export interface HealthReport {
  status: "ok" | "error";
  database: "connected" | "disconnected";
  message: string;
  checkedAt: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly db: Database) {}

  async getHealthReport(): Promise<HealthReport> {
    try {
      await this.db.query("SELECT 1");

      return {
        status: "ok",
        database: "connected",
        message: "Database reachable",
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      // `/health` é público (healthcheck do compose). O erro do driver traz host,
      // porta e às vezes credencial — vai para o log, não para o corpo.
      this.logger.error(
        `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        status: "error",
        database: "disconnected",
        message: "Database unreachable",
        checkedAt: new Date().toISOString(),
      };
    }
  }
}
