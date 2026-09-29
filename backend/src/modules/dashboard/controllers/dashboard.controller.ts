import { Controller, Get } from "@nestjs/common";

import { Tenant } from "../../../common/decorators/auth.decorators.js";
import { getDashboard } from "../services/dashboard.service.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";

@Controller("api/dashboard")
export class DashboardController {
  @Get()
  async get(@Tenant() tenantId: TenantId) {
    const dashboard = await getDashboard(tenantId);
    return { dashboard };
  }
}
