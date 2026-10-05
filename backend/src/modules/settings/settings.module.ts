import { Module } from "@nestjs/common";

import { SettingsController } from "./controllers/settings.controller.js";
import { SettingsRepository } from "./repositories/settings.repository.js";
import { SettingsService } from "./services/settings.service.js";

@Module({
  controllers: [SettingsController],
  providers: [SettingsRepository, SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
