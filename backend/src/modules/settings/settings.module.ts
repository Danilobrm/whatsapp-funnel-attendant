import { Module } from "@nestjs/common";

import { SettingsController } from "./controllers/settings.controller.js";

@Module({ controllers: [SettingsController] })
export class SettingsModule {}
