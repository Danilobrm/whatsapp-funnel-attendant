import { generateAgentReply } from "../agent/agent.service.js";
import { classifyMessage } from "../ai/guardrails.js";
import { InvalidInputError } from "../errors/invalidInput.error.js";
import {
  buildPersonaTexts,
  DEFAULT_BOT_SETTINGS,
  getBotSettings,
} from "../settings/settings.service.js";
import { findTenantById } from "../tenants/tenant.repository.js";
import {
  findRecentMessages,
  insertMessage,
  upsertConversation,
} from "./conversation.repository.js";

import type { BotSettings } from "../settings/settings.types.js";
import type { TenantId } from "../tenants/tenant.types.js";
import type {
  ConversationReply,
  InboundMessage,
  ReplyProvider,
} from "./conversation.types.js";

/** WhatsApp aceita até 4096 caracteres numa mensagem de texto. */
export const MAX_INBOUND_CHARS = 4096;

/**
 * Silêncio a partir do qual a próxima mensagem conta como INÍCIO de conversa.
 * Só no início o porteiro responde saudação e "não entendi" pela persona; no
 * meio de um pedido, "ok", "blz" e "obrigado" são respostas ao que o bot
 * perguntou e precisam chegar ao agente.
 */
export const CONVERSATION_IDLE_MS = 2 * 60 * 60 * 1000;

/** Quantas mensagens anteriores o agente enxerga. */
export const HISTORY_LIMIT = 20;

export const UNSUPPORTED_MEDIA_REPLY =
  "Por enquanto eu só consigo ler mensagens de texto. Pode escrever o que você precisa?";

interface Decision {
  replies: string[];
  provider: ReplyProvider;
}

/**
 * Falha ao ler a persona não pode derrubar a conversa: cai no default e segue.
 */
async function loadSettings(tenantId: TenantId): Promise<BotSettings> {
  try {
    return await getBotSettings(tenantId);
  } catch (err) {
    console.error(
      "Falha ao carregar a persona:",
      err instanceof Error ? err.message : String(err),
    );
    return DEFAULT_BOT_SETTINGS;
  }
}

async function decideReply(
  tenantId: TenantId,
  conversationId: number,
  text: string,
  isConversationStart: boolean,
): Promise<Decision> {
  const settings = await loadSettings(tenantId);
  const persona = buildPersonaTexts(settings);
  const gate = classifyMessage(text);

  // Identidade responde sempre pela persona: o LLM inventaria um nome.
  if (gate.kind === "identity") {
    return { replies: [persona.identity], provider: "persona" };
  }

  if (isConversationStart) {
    if (gate.kind === "greeting") {
      return { replies: [persona.greeting], provider: "persona" };
    }
    if (gate.kind === "junk") {
      return { replies: [persona.junk], provider: "persona" };
    }
  }

  const [tenant, history] = await Promise.all([
    findTenantById(tenantId),
    findRecentMessages(tenantId, conversationId, HISTORY_LIMIT),
  ]);

  const { reply } = await generateAgentReply({
    businessName: tenant?.name ?? "",
    settings,
    history,
  });

  if (reply === null) {
    return { replies: [persona.fallback], provider: "persona" };
  }
  return { replies: [reply], provider: "agent" };
}

/**
 * Porta única de entrada da conversa, para qualquer canal.
 *
 * Ordem importa:
 * 1. grava a mensagem do cliente ANTES de decidir — é a deduplicação (reenvio
 *    da Meta devolve `duplicate: true` e nada é respondido) e é o que coloca a
 *    mensagem atual no histórico do agente;
 * 2. decide a resposta (persona ou agente);
 * 3. grava as respostas. Falha nesta última etapa é logada e engolida: a
 *    resposta já foi decidida e o cliente precisa recebê-la.
 */
export async function handleInboundMessage(
  tenantId: TenantId,
  input: InboundMessage,
): Promise<ConversationReply> {
  const unsupported = input.unsupportedType ?? null;
  const text = unsupported ? `[${unsupported}]` : input.text.trim();

  if (text.length === 0) {
    throw new InvalidInputError("text_required", "text");
  }
  if (text.length > MAX_INBOUND_CHARS) {
    throw new InvalidInputError("text_too_long", "text");
  }

  const conversation = await upsertConversation(
    tenantId,
    input.channel,
    input.contact,
    input.contactName ?? null,
  );

  const inserted = await insertMessage(
    tenantId,
    conversation.id,
    "inbound",
    text,
    input.externalId ?? null,
  );
  if (!inserted) {
    return { duplicate: true, replies: [], provider: null };
  }

  const isConversationStart =
    conversation.previousMessageAt === null ||
    Date.now() - conversation.previousMessageAt.getTime() >
      CONVERSATION_IDLE_MS;

  const decision: Decision = unsupported
    ? { replies: [UNSUPPORTED_MEDIA_REPLY], provider: "persona" }
    : await decideReply(tenantId, conversation.id, text, isConversationStart);

  for (const reply of decision.replies) {
    try {
      await insertMessage(tenantId, conversation.id, "outbound", reply, null);
    } catch (err) {
      console.error(
        "Falha ao registrar a resposta (seguindo com o envio):",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { duplicate: false, ...decision };
}
