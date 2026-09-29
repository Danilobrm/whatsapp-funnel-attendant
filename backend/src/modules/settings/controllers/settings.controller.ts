import { Body, Controller, Get, Put } from "@nestjs/common";

import { Tenant } from "../../../common/decorators/auth.decorators.js";
import {
  buildPersonaTexts,
  getBotSettings,
  settingsOptions,
  updateBotSettings,
} from "../services/settings.service.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";

@Controller("api/settings")
export class SettingsController {
  @Get()
  async get(@Tenant() tenantId: TenantId) {
    const settings = await getBotSettings(tenantId);
    return {
      settings,
      options: settingsOptions(),
      preview: buildPersonaTexts(settings),
    };
  }

  @Put()
  async put(@Tenant() tenantId: TenantId, @Body() body: unknown) {
    const settings = await updateBotSettings(tenantId, body);
    return { settings, preview: buildPersonaTexts(settings) };
  }
}
