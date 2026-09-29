import { env } from "../../../config/env.js";
import { fetchWithTimeout } from "../../../lib/fetchWithTimeout.js";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

/** Chave de API ausente = erro claro; o agente o captura e cai no fallback. */
export class LlmNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`llm_not_configured:${provider}`);
    this.name = "LlmNotConfiguredError";
  }
}

/**
 * Modelo de chat do agente, escolhido por `LLM_PROVIDER`. Sempre com timeout
 * por chamada (fetch com prazo / `timeout` do SDK): o modelo fica no caminho
 * de uma resposta ao cliente.
 *
 * Os SDKs dos provedores são importados sob demanda — quem usa Ollama não
 * carrega os outros dois.
 */
export async function createChatLlm(): Promise<BaseChatModel> {
  const { provider, model, timeoutMs } = env.llm;

  if (provider === "anthropic") {
    if (!env.llm.anthropicApiKey) throw new LlmNotConfiguredError(provider);
    const { ChatAnthropic } = await import("@langchain/anthropic");
    return new ChatAnthropic({
      model,
      apiKey: env.llm.anthropicApiKey,
      maxRetries: 1,
      clientOptions: { timeout: timeoutMs },
    });
  }

  if (provider === "openai") {
    if (!env.llm.openaiApiKey) throw new LlmNotConfiguredError(provider);
    const { ChatOpenAI } = await import("@langchain/openai");
    return new ChatOpenAI({
      model,
      apiKey: env.llm.openaiApiKey,
      maxRetries: 1,
      timeout: timeoutMs,
    });
  }

  if (provider === "gemini") {
    if (!env.llm.geminiApiKey) throw new LlmNotConfiguredError(provider);
    const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
    // Sem opção de timeout no construtor: o prazo por chamada vai no `invoke`
    // do agente (`{ timeout }`), que vale para todos os provedores.
    return new ChatGoogleGenerativeAI({
      model,
      apiKey: env.llm.geminiApiKey,
      maxRetries: 1,
    });
  }

  const { ChatOllama } = await import("@langchain/ollama");
  return new ChatOllama({
    baseUrl: env.ollamaBaseUrl,
    model,
    fetch: fetchWithTimeout(timeoutMs),
  });
}
