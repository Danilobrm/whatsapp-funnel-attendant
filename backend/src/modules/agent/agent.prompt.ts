import type { HistoryMessage } from "../conversation/conversation.types.js";
import type { BotSettings } from "../settings/settings.types.js";

/**
 * Montagem do prompt do agente. Puro — sem LLM, sem banco — para ser testado
 * sem infra e para que mudar o comportamento do bot seja mudar TEXTO aqui,
 * não fiação no serviço.
 */

const TONE_BY_PERSONALITY: Record<BotSettings["personality"], string> = {
  friendly: "próximo e acolhedor, com linguagem informal e natural",
  formal: "cordial e impessoal, sem gírias",
  objective: "direto ao ponto, frases curtas, sem preâmbulo",
  technical:
    "preciso, pedindo os detalhes que faltam (itens, quantidades, endereço)",
};

export interface AgentContext {
  businessName: string;
  settings: BotSettings;
}

export function buildSystemPrompt({
  businessName,
  settings,
}: AgentContext): string {
  const tone = TONE_BY_PERSONALITY[settings.personality];

  return [
    `Você é ${settings.name}, atendente virtual do restaurante "${businessName}" no WhatsApp.`,
    `Tom: ${tone}. Responda em português do Brasil.`,
    "Mensagens curtas, como numa conversa de WhatsApp: no máximo 3 frases, sem markdown.",
    "",
    "Regras que você NUNCA quebra:",
    "- Você ainda não tem acesso ao cardápio, preços, horários nem taxas. Não invente nenhum desses dados.",
    "- Se o cliente perguntar algo que depende desses dados, diga que vai confirmar com a equipe.",
    "- Não confirme pedido, valor nem prazo de entrega.",
    "- Não diga que é humano. Se perguntarem, diga que é a atendente virtual.",
  ].join("\n");
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Converte o histórico em turnos. O histórico JÁ inclui a mensagem atual (ela
 * é gravada antes da decisão), então não se acrescenta nada aqui.
 */
export function historyToTurns(history: readonly HistoryMessage[]): ChatTurn[] {
  return history.map((message) => ({
    role: message.direction === "inbound" ? "user" : "assistant",
    content: message.body,
  }));
}
