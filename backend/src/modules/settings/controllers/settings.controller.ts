import { Body, Controller, Get, Put } from "@nestjs/common";

import { Tenant } from "../../../common/decorators/auth.decorators.js";
import { SettingsService } from "../services/settings.service.js";
import { buildPersonaTexts, settingsOptions } from "../utils/persona.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";

@Controller("api/settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get(@Tenant() tenantId: TenantId) {
    const settings = await this.settings.getBotSettings(tenantId);
    return {
      settings,
      options: settingsOptions(),
      preview: buildPersonaTexts(settings),
    };
  }

  @Put()
  async put(@Tenant() tenantId: TenantId, @Body() body: unknown) {
    const settings = await this.settings.updateBotSettings(tenantId, body);
    return { settings, preview: buildPersonaTexts(settings) };
  }
}
