import { Controller, Get } from "@nestjs/common";

import { Tenant } from "../../../common/decorators/auth.decorators.js";
import { DashboardService } from "../services/dashboard.service.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";

@Controller("api/dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  async get(@Tenant() tenantId: TenantId) {
    const dashboard = await this.dashboard.getDashboard(tenantId);
    return { dashboard };
  }
}
