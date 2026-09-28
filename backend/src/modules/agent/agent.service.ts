import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";

import { createChatLlm } from "../ai/ollama-client.js";
import { buildSystemPrompt, historyToTurns } from "./agent.prompt.js";

import type { HistoryMessage } from "../conversation/conversation.types.js";
import type { BotSettings } from "../settings/settings.types.js";

export interface AgentInput {
  businessName: string;
  settings: BotSettings;
  /** Histórico em ordem cronológica, terminando na mensagem atual do cliente. */
  history: readonly HistoryMessage[];
}

/** Resposta do agente. `null` = não conseguiu; quem chama usa o fallback. */
export interface AgentOutput {
  reply: string | null;
}

/** WhatsApp aceita até 4096 caracteres por mensagem de texto. */
const MAX_REPLY_CHARS = 1500;

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? String((part as { text: unknown }).text)
          : "",
      )
      .join("");
  }
  return "";
}

/**
 * Gera a resposta do atendente.
 *
 * Nunca lança: LLM fora do ar, timeout ou resposta vazia viram `{ reply: null }`
 * e a conversa cai no fallback da persona. O cliente no WhatsApp não pode
 * ficar sem resposta porque o modelo engasgou.
 *
 * Ponto de extensão principal do projeto: cardápio, carrinho e fechamento de
 * pedido entram aqui (tools do agente), não no serviço de conversa.
 */
export async function generateAgentReply(
  input: AgentInput,
): Promise<AgentOutput> {
  const messages = [
    new SystemMessage(buildSystemPrompt(input)),
    ...historyToTurns(input.history).map((turn) =>
      turn.role === "user"
        ? new HumanMessage(turn.content)
        : new AIMessage(turn.content),
    ),
  ];

  try {
    const result = await createChatLlm().invoke(messages);
    const text = contentToText(result.content).trim();
    if (text.length === 0) return { reply: null };
    return { reply: text.slice(0, MAX_REPLY_CHARS) };
  } catch (err) {
    console.error(
      "Agente indisponível, caindo no fallback:",
      err instanceof Error ? err.message : String(err),
    );
    return { reply: null };
  }
}
