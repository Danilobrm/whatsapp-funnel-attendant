import { Controller, Get, Res } from "@nestjs/common";

import { Public } from "../../../common/decorators/auth.decorators.js";
import { HealthService } from "../services/health.service.js";

import type { Response } from "express";

/** Público: é o healthcheck do compose, que não tem token para apresentar. */
@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const report = await this.health.getHealthReport();

    res.status(report.status === "ok" ? 200 : 500);
    return report;
  }
}
