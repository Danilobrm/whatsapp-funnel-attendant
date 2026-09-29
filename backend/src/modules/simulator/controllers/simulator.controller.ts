import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
} from "@nestjs/common";

import { Auth } from "../../../common/decorators/auth.decorators.js";
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
function contactOf(
  auth: RequestAuth,
  queryContactId: unknown,
  body?: unknown,
): string {
  const fromBody = (body as { contactId?: unknown } | undefined)?.contactId;
  return simulatorContactFor(auth.userId, queryContactId ?? fromBody);
}

@Controller("api/simulator")
export class SimulatorController {
  @Get("conversation")
  async getConversation(
    @Auth() auth: RequestAuth,
    @Query("contactId") contactId: unknown,
  ) {
    const items = await findMessagesByContact(
      auth.tenantId,
      "simulator",
      contactOf(auth, contactId),
      HISTORY_LIMIT,
    );
    return { items };
  }

  @HttpCode(204)
  @Delete("conversation")
  async deleteConversation(
    @Auth() auth: RequestAuth,
    @Query("contactId") contactId: unknown,
  ): Promise<void> {
    await deleteConversation(
      auth.tenantId,
      "simulator",
      contactOf(auth, contactId),
    );
  }

  @Get("cart")
  async getCart(
    @Auth() auth: RequestAuth,
    @Query("contactId") contactId: unknown,
  ) {
    const cart = await getSimulatorCart(
      auth.tenantId,
      contactOf(auth, contactId),
    );
    return { cart };
  }

  /**
   * Mesmo `handleInboundMessage` do webhook do WhatsApp — o que o dono testa
   * aqui é o que o cliente recebe lá. Só o simulador recebe `debug` (ferramentas
   * chamadas + carrinho): é a ferramenta de depuração do agente.
   */
  // 200, não o 201 padrão do Nest: enviar uma mensagem não cria recurso da API.
  @HttpCode(200)
  @Post("messages")
  async postMessage(
    @Auth() auth: RequestAuth,
    @Query("contactId") contactId: unknown,
    @Body() body: unknown,
  ) {
    const text = (body as { text?: unknown } | undefined)?.text;

    if (typeof text !== "string" || text.trim().length === 0) {
      throw new InvalidInputError("text_required", "text");
    }
    if (text.length > MAX_SIMULATOR_CHARS) {
      throw new InvalidInputError("text_too_long", "text");
    }

    const contact = contactOf(auth, contactId, body);
    const result = await handleInboundMessage(auth.tenantId, {
      channel: "simulator",
      contact,
      text,
    });

    return {
      replies: result.replies,
      provider: result.provider,
      debug: {
        toolCalls: result.trace ?? [],
        cart: await getSimulatorCart(auth.tenantId, contact),
      },
    };
  }

  @Get("customers")
  async getCustomers(@Auth() auth: RequestAuth) {
    const items = await listCustomers(auth.tenantId);
    return { items };
  }

  @Post("customers")
  async postCustomer(@Auth() auth: RequestAuth, @Body() body: unknown) {
    const customer = await createCustomer(auth.tenantId, body);
    return { customer };
  }
}
