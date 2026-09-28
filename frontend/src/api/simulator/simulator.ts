import { request } from '../client';

export type MessageDirection = 'inbound' | 'outbound';

/** Quem escreveu a resposta: texto fixo da persona ou o agente (IA). */
export type ReplyProvider = 'persona' | 'agent';

export interface HistoryMessage {
  direction: MessageDirection;
  body: string;
  createdAt: string;
}

export interface SimulatorReply {
  replies: string[];
  provider: ReplyProvider | null;
}

/** 422 do simulador. `code` resolve `chat.errors.<code>`. */
export class SimulatorRejectedError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`simulator_rejected:${code}`);
    this.name = 'SimulatorRejectedError';
    this.code = code;
  }
}

function rejected(payload: unknown): Error {
  const code = (payload as { code?: unknown } | null)?.code;
  return new SimulatorRejectedError(
    typeof code === 'string' ? code : 'unknown',
  );
}

/** Conversa de teste do admin logado (o tenant vem do JWT). */
export async function fetchSimulatorConversation(): Promise<HistoryMessage[]> {
  const data = await request<{ items: HistoryMessage[] }>(
    '/api/simulator/conversation',
  );
  return data.items;
}

/**
 * Envia como se fosse um cliente. O backend usa o MESMO fluxo do webhook do
 * WhatsApp — a resposta aqui é a que o cliente receberia lá.
 */
export function sendSimulatorMessage(text: string): Promise<SimulatorReply> {
  return request<SimulatorReply>('/api/simulator/messages', {
    method: 'POST',
    body: { text },
    onStatus: { 422: rejected },
  });
}

export function resetSimulatorConversation(): Promise<void> {
  return request<void>('/api/simulator/conversation', { method: 'DELETE' });
}
