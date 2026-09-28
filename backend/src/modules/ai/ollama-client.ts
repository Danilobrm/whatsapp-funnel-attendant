import { ChatOllama } from "@langchain/ollama";

import { env } from "../../config/env.js";
import { fetchWithTimeout } from "../../lib/fetchWithTimeout.js";

/** Modelo de chat do agente. Sempre com timeout — ver `fetchWithTimeout`. */
export function createChatLlm(): ChatOllama {
  return new ChatOllama({
    baseUrl: env.ollamaBaseUrl,
    model: env.ollamaModel,
    fetch: fetchWithTimeout(env.ollamaTimeoutMs),
  });
}
