import { request } from '../client/client.ts';

export type MessageDirection = 'inbound' | 'outbound';

/** Quem escreveu a resposta: texto fixo da persona ou o agente (IA). */
export type ReplyProvider = 'persona' | 'agent';

export interface HistoryMessage {
  direction: MessageDirection;
  body: string;
  createdAt: string;
}

/** O que o atendente vê no carrinho — espelha `CartView` do backend. */
export interface SimulatorCartLine {
  number: number;
  name: string;
  size: string | null;
  options: string[];
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  notes: string | null;
}

export type CartStatus = 'open' | 'awaiting_confirmation';

export interface SimulatorCart {
  status: CartStatus;
  lines: SimulatorCartLine[];
  subtotalCents: number;
  feeCents: number;
  totalCents: number;
  fulfillment: 'delivery' | 'pickup' | null;
  address: string | null;
  payment: string | null;
  changeFor: string | null;
  notes: string | null;
  /** Texto do backend para o modelo — mostrado cru no painel de depuração. */
  pending: string[];
}

/** Uma ferramenta que o agente chamou no turno. */
export interface ToolCallTrace {
  name: string;
  args: unknown;
  result: Record<string, unknown>;
}

/** Só o simulador recebe: é a ferramenta de depuração do agente. */
export interface SimulatorDebug {
  toolCalls: ToolCallTrace[];
  cart: SimulatorCart | null;
}

export interface SimulatorReply {
  replies: string[];
  provider: ReplyProvider | null;
  debug?: SimulatorDebug;
}

/** Cliente de teste. `contactId` (telefone) vai nas chamadas do simulador. */
export interface SimulatedCustomer {
  contactId: string;
  name: string | null;
  phone: string;
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

/** `null` = conversa padrão do admin; com id, um cliente de teste. */
export type ContactId = string | null;

function withContact(path: string, contactId: ContactId): string {
  return contactId === null
    ? path
    : `${path}?contactId=${encodeURIComponent(contactId)}`;
}

/** Conversa de teste do admin logado (o tenant vem do JWT). */
export async function fetchSimulatorConversation(
  contactId: ContactId = null,
): Promise<HistoryMessage[]> {
  const data = await request<{ items: HistoryMessage[] }>(
    withContact('/api/simulator/conversation', contactId),
  );
  return data.items;
}

/** Carrinho atual da conversa de teste. `null` = nada no carrinho. */
export async function fetchSimulatorCart(
  contactId: ContactId = null,
): Promise<SimulatorCart | null> {
  const data = await request<{ cart: SimulatorCart | null }>(
    withContact('/api/simulator/cart', contactId),
  );
  return data.cart;
}

/**
 * Envia como se fosse um cliente. O backend usa o MESMO fluxo do webhook do
 * WhatsApp — a resposta aqui é a que o cliente receberia lá.
 */
export function sendSimulatorMessage(
  text: string,
  contactId: ContactId = null,
): Promise<SimulatorReply> {
  return request<SimulatorReply>('/api/simulator/messages', {
    method: 'POST',
    body: contactId === null ? { text } : { text, contactId },
    onStatus: { 422: rejected },
  });
}

export function resetSimulatorConversation(
  contactId: ContactId = null,
): Promise<void> {
  return request<void>(withContact('/api/simulator/conversation', contactId), {
    method: 'DELETE',
  });
}

export async function fetchSimulatedCustomers(): Promise<SimulatedCustomer[]> {
  const data = await request<{ items: SimulatedCustomer[] }>(
    '/api/simulator/customers',
  );
  return data.items;
}

export async function createSimulatedCustomer(input: {
  name: string;
  phone: string;
}): Promise<SimulatedCustomer> {
  const data = await request<{ customer: SimulatedCustomer }>(
    '/api/simulator/customers',
    { method: 'POST', body: input, onStatus: { 422: rejected } },
  );
  return data.customer;
}
