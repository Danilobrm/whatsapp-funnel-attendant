import { Module } from "@nestjs/common";

import { LlmClientFactory } from "./clients/llm-client.js";

@Module({ providers: [LlmClientFactory], exports: [LlmClientFactory] })
export class AiModule {}
