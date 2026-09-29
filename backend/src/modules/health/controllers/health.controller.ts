import { Controller, Get, Res } from "@nestjs/common";

import { Public } from "../../../common/decorators/auth.decorators.js";
import { getHealthReport } from "../services/health.service.js";

import type { Response } from "express";

/** Público: é o healthcheck do compose, que não tem token para apresentar. */
@Public()
@Controller("health")
export class HealthController {
  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    const report = await getHealthReport();

    res.status(report.status === "ok" ? 200 : 500);
    return report;
  }
}
