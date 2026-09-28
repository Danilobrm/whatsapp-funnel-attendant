import {
  deleteConversation,
  findMessagesByContact,
} from "../../modules/conversation/conversation.repository.js";
import { handleInboundMessage } from "../../modules/conversation/conversation.service.js";
import { InvalidInputError } from "../../modules/errors/invalidInput.error.js";
import { authOf } from "../utils/authContext.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import type { RequestAuth } from "../../modules/auth/auth.types.js";

/** Limite do composer do painel. Bem abaixo dos 4096 do WhatsApp. */
export const MAX_SIMULATOR_CHARS = 1000;

const HISTORY_LIMIT = 100;

/**
 * Cada admin tem a própria conversa de teste, isolada do WhatsApp real pelo
 * canal `simulator` e dos outros admins pelo userId.
 */
function simulatorContact(auth: RequestAuth): string {
  return `admin-${auth.userId}`;
}

export const getSimulatorConversation = asyncHandler(async (req, res) => {
  const auth = authOf(req);
  const items = await findMessagesByContact(
    auth.tenantId,
    "simulator",
    simulatorContact(auth),
    HISTORY_LIMIT,
  );
  res.json({ items });
});

/**
 * Mesmo `handleInboundMessage` do webhook do WhatsApp — o que o dono testa
 * aqui é o que o cliente recebe lá.
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

  const result = await handleInboundMessage(auth.tenantId, {
    channel: "simulator",
    contact: simulatorContact(auth),
    text,
  });

  res.json({ replies: result.replies, provider: result.provider });
});

export const deleteSimulatorConversation = asyncHandler(async (req, res) => {
  const auth = authOf(req);
  await deleteConversation(auth.tenantId, "simulator", simulatorContact(auth));
  res.status(204).end();
});
