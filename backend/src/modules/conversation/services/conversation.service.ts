import { generateAgentReply } from "../../agent/services/agent.service.js";
import { classifyMessage } from "../../ai/utils/guardrails.js";
import { resolveCustomer } from "../../customer/services/customer.service.js";
import { InvalidInputError } from "../../errors/invalidInput.error.js";
import {
  buildPersonaTexts,
  DEFAULT_BOT_SETTINGS,
  getBotSettings,
} from "../../settings/services/settings.service.js";
import { isOwnerNumber } from "../../store/utils/owner.js";
import { setStoreLocation } from "../../store/services/store.location.js";
import { getStoreSettings } from "../../store/services/store.service.js";
import { findTenantById } from "../../tenants/repositories/tenant.repository.js";
import { sendWhatsAppText } from "../../whatsapp/clients/whatsapp.client.js";
import {
  findConversationTarget,
  findRecentMessages,
  insertMessage,
  upsertConversation,
} from "../repositories/conversation.repository.js";

import type { ToolTrace } from "../../agent/services/agent.service.js";
import type { BotSettings } from "../../settings/types/settings.types.js";
import type { TenantId } from "../../tenants/types/tenant.types.js";
import type {
  ConversationReply,
  InboundMessage,
  ReplyProvider,
} from "../types/conversation.types.js";

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

export const OWNER_LOCATION_SAVED_REPLY = (address: string) =>
  `Localização da loja atualizada: ${address}`;
export const OWNER_LOCATION_NO_ADDRESS_REPLY =
  "Guardei o ponto no mapa, mas não consegui descobrir o endereço agora. Envie a localização de novo em instantes.";
export const OWNER_LOCATION_FAILED_REPLY =
  "Não consegui salvar a localização da loja agora. Tente de novo em instantes.";

interface Decision {
  replies: string[];
  provider: ReplyProvider;
  /** Ferramentas chamadas neste turno (só o agente produz). */
  trace?: ToolTrace[];
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

/**
 * Localização vinda do número do DONO define o endereço da loja. Qualquer
 * outro número (cliente) cai no aviso de mídia não suportada.
 */
async function decideLocation(
  tenantId: TenantId,
  contact: string,
  location: { latitude: number; longitude: number },
): Promise<Decision> {
  try {
    const store = await getStoreSettings(tenantId);
    if (!isOwnerNumber(store.ownerWhatsapp, contact)) {
      return { replies: [UNSUPPORTED_MEDIA_REPLY], provider: "persona" };
    }
    const { address } = await setStoreLocation(
      tenantId,
      location.latitude,
      location.longitude,
    );
    return {
      replies: [
        address
          ? OWNER_LOCATION_SAVED_REPLY(address)
          : OWNER_LOCATION_NO_ADDRESS_REPLY,
      ],
      provider: "persona",
    };
  } catch (err) {
    console.error(
      "Falha ao salvar a localização da loja:",
      err instanceof Error ? err.message : String(err),
    );
    return { replies: [OWNER_LOCATION_FAILED_REPLY], provider: "persona" };
  }
}

async function decideReply(
  tenantId: TenantId,
  conversationId: number,
  text: string,
  isConversationStart: boolean,
  who: Pick<InboundMessage, "channel" | "contact" | "contactName">,
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

  const customer = await resolveCustomer(
    tenantId,
    who.channel,
    who.contact,
    who.contactName ?? null,
  );

  const { reply, trace } = await generateAgentReply({
    tenantId,
    conversationId,
    businessName: tenant?.name ?? "",
    settings,
    history,
    customer,
    contactName: who.contactName ?? null,
  });

  if (reply === null) {
    return { replies: [persona.fallback], provider: "persona", trace };
  }
  return { replies: [reply], provider: "agent", trace };
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

  let decision: Decision;
  if (unsupported === "location" && input.location) {
    decision = await decideLocation(tenantId, input.contact, input.location);
  } else if (unsupported) {
    decision = { replies: [UNSUPPORTED_MEDIA_REPLY], provider: "persona" };
  } else {
    decision = await decideReply(
      tenantId,
      conversation.id,
      text,
      isConversationStart,
      input,
    );
  }

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

/**
 * Mensagem ATIVA ao cliente (ex.: "pedido saiu para entrega"), fora do ciclo
 * pergunta-resposta. Canal-agnóstica: grava sempre na conversa (o simulador
 * mostra) e só vai para a Meta quando a conversa é de WhatsApp. É o único
 * ponto fora de `modules/whatsapp/` que decide canal.
 *
 * Devolve `false` quando a conversa não existe/não é deste tenant.
 */
export async function sendOutbound(
  tenantId: TenantId,
  conversationId: number,
  text: string,
): Promise<boolean> {
  const target = await findConversationTarget(tenantId, conversationId);
  if (!target) return false;

  await insertMessage(tenantId, conversationId, "outbound", text, null);

  if (target.channel === "whatsapp") {
    if (!target.whatsappPhoneNumberId) {
      console.warn(
        `[outbound] tenant ${tenantId} sem whatsapp_phone_number_id — mensagem não enviada.`,
      );
      return true;
    }
    await sendWhatsAppText(target.whatsappPhoneNumberId, target.contact, text);
  }
  return true;
}
