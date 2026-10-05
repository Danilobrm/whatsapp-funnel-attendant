import { Module } from "@nestjs/common";

import { TenantRepository } from "./repositories/tenant.repository.js";
import { TenantService } from "./services/tenant.service.js";

@Module({
  providers: [TenantRepository, TenantService],
  exports: [TenantRepository, TenantService],
})
export class TenantsModule {}
