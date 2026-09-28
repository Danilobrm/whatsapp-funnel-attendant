/**
 * Contrato da conversa, independente de canal.
 *
 * O WhatsApp e o simulador do painel entram pelo MESMO `handleInboundMessage`.
 * É isso que garante que o que o dono do restaurante testa no simulador é o
 * que o cliente recebe no WhatsApp — um segundo caminho divergiria calado.
 */
export const CHANNELS = ["whatsapp", "simulator"] as const;

export type Channel = (typeof CHANNELS)[number];

export type MessageDirection = "inbound" | "outbound";

export interface InboundMessage {
  channel: Channel;
  /** WhatsApp: wa_id do cliente. Simulador: `admin-<userId>`. */
  contact: string;
  contactName?: string | null;
  text: string;
  /**
   * Id da mensagem no canal (wamid.* no WhatsApp). Chave de deduplicação: a
   * Meta reenvia o webhook quando não recebe 200 a tempo.
   */
  externalId?: string | null;
  /**
   * Tipo de mídia que o bot ainda não sabe ler (áudio, imagem, localização...).
   * Presente = a mensagem é registrada para deduplicação e o bot responde com
   * o aviso fixo, sem chamar o agente.
   */
  unsupportedType?: string | null;
}

export interface HistoryMessage {
  direction: MessageDirection;
  body: string;
  createdAt: string;
}

/**
 * Quem escreveu a resposta: `persona` = texto determinístico de
 * `bot_settings`; `agent` = LLM. `null` quando não houve resposta (duplicada).
 */
export type ReplyProvider = "persona" | "agent";

export interface ConversationReply {
  /** Mensagem já processada antes (reenvio do canal). Nada foi respondido. */
  duplicate: boolean;
  replies: string[];
  provider: ReplyProvider | null;
}
