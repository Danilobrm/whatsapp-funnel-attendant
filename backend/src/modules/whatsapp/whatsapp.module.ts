import { Module } from "@nestjs/common";

import { WhatsAppController } from "./controllers/whatsapp.controller.js";

@Module({ controllers: [WhatsAppController] })
export class WhatsAppModule {}
