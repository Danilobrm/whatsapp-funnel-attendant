import {
  deleteConversation,
  findMessagesByContact,
} from "../../conversation/repositories/conversation.repository.js";
import { handleInboundMessage } from "../../conversation/services/conversation.service.js";
import { InvalidInputError } from "../../errors/invalidInput.error.js";
import {
  createCustomer,
  getSimulatorCart,
  listCustomers,
  simulatorContactFor,
} from "../services/simulator.service.js";
import { authOf } from "../../../api/utils/authContext.js";
import { asyncHandler } from "../../../api/utils/asyncHandler.js";

import type { Request } from "express";
import type { RequestAuth } from "../../auth/types/auth.types.js";

/** Limite do composer do painel. Bem abaixo dos 4096 do WhatsApp. */
export const MAX_SIMULATOR_CHARS = 1000;

const HISTORY_LIMIT = 100;

/**
 * Cada admin tem a própria conversa de teste padrão (`admin-<userId>`),
 * isolada do WhatsApp real pelo canal `simulator` e dos outros admins pelo
 * userId. Com `contactId` (telefone fictício) a chamada vai para um cliente
 * de teste, `sim-<telefone>`, do tenant.
 */
function contactOf(req: Request, auth: RequestAuth, body?: unknown): string {
  const fromBody = (body as { contactId?: unknown } | undefined)?.contactId;
  const contactId = req.query.contactId ?? fromBody;
  return simulatorContactFor(auth.userId, contactId);
}

export const getSimulatorConversation = asyncHandler(async (req, res) => {
  const auth = authOf(req);
  const items = await findMessagesByContact(
    auth.tenantId,
    "simulator",
    contactOf(req, auth),
    HISTORY_LIMIT,
  );
  res.json({ items });
});

export const getSimulatorCartHandler = asyncHandler(async (req, res) => {
  const auth = authOf(req);
  const cart = await getSimulatorCart(auth.tenantId, contactOf(req, auth));
  res.json({ cart });
});

/**
 * Mesmo `handleInboundMessage` do webhook do WhatsApp — o que o dono testa
 * aqui é o que o cliente recebe lá. Só o simulador recebe `debug` (ferramentas
 * chamadas + carrinho): é a ferramenta de depuração do agente.
 */
export const postSimulatorMessage = asyncHandler(async (req, res) => {
  const auth = authOf(req);
  const text = (req.body as { text?: unknown } | undefined)?.text;

  if (typeof text !== "string" || text.trim().length === 0) {
    throw new InvalidInputError("text_required", "text");
  }
  if (text.length > MAX_SIMULATOR_CHARS) {
    throw new InvalidInputError("text_too_long", "text");
  }

  const contact = contactOf(req, auth, req.body);
  const result = await handleInboundMessage(auth.tenantId, {
    channel: "simulator",
    contact,
    text,
  });

  res.json({
    replies: result.replies,
    provider: result.provider,
    debug: {
      toolCalls: result.trace ?? [],
      cart: await getSimulatorCart(auth.tenantId, contact),
    },
  });
});

export const deleteSimulatorConversation = asyncHandler(async (req, res) => {
  const auth = authOf(req);
  await deleteConversation(auth.tenantId, "simulator", contactOf(req, auth));
  res.status(204).end();
});

export const getSimulatorCustomers = asyncHandler(async (req, res) => {
  const items = await listCustomers(authOf(req).tenantId);
  res.json({ items });
});

export const postSimulatorCustomer = asyncHandler(async (req, res) => {
  const customer = await createCustomer(authOf(req).tenantId, req.body);
  res.status(201).json({ customer });
});
