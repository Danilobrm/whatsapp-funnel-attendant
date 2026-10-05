import { Injectable, Logger } from "@nestjs/common";

import { LlmClientFactory } from "../../ai/clients/llm-client.js";
import { AgentContextService } from "./agent.context.js";
import { AgentToolExecutor } from "../tools/executor.js";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { env } from "../../../config/env.js";
import { buildSystemPrompt, historyToTurns } from "../utils/agent.prompt.js";
import { TOOL_DEFINITIONS } from "../tools/definitions.js";
import type { BaseMessage } from "@langchain/core/messages";
import type { Customer } from "../../customer/types/customer.types.js";
import type { HistoryMessage } from "../../conversation/types/conversation.types.js";
import type { BotSettings } from "../../settings/types/settings.types.js";
import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { ToolContext } from "../tools/executor.js";

export interface AgentInput {
  tenantId: TenantId;
  conversationId: number;
  businessName: string;
  settings: BotSettings;
  /** Histórico em ordem cronológica, terminando na mensagem atual do cliente. */
  history: readonly HistoryMessage[];
  customer?: Customer | null;
  /** Nome de perfil do canal (WhatsApp). */
  contactName?: string | null;
}

/** Uma chamada de ferramenta do turno — o simulador mostra em modo dev. */
export interface ToolTrace {
  name: string;
  args: unknown;
  result: Record<string, unknown>;
}

/** Resposta do agente. `reply: null` = não conseguiu; quem chama usa o fallback. */
export interface AgentOutput {
  reply: string | null;
  trace: ToolTrace[];
}

/**
 * Teto de rodadas de ferramenta por mensagem. Modelo que não converge em 6
 * rodadas está em laço: cai no fallback da persona em vez de girar.
 */
export const MAX_TOOL_ITERATIONS = 6;

/** WhatsApp aceita até 4096 caracteres por mensagem de texto. */
const MAX_REPLY_CHARS = 1500;

const MAX_SYSTEM_REPLY_CHARS = 4000;

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

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly llm: LlmClientFactory,
    private readonly context: AgentContextService,
    private readonly tools: AgentToolExecutor,
  ) {}

  /**
   * Gera a resposta do atendente: conversa e, quando o cliente pede, monta o
   * pedido chamando ferramentas (cardápio, carrinho, entrega, pagamento).
   *
   * Nunca lança: LLM fora do ar, timeout, chave ausente, laço de ferramentas ou
   * resposta vazia viram `{ reply: null }` e a conversa cai no fallback da
   * persona. O cliente no WhatsApp não pode ficar sem resposta porque o modelo
   * engasgou.
   *
   * Duas respostas NÃO vêm do modelo, e encerram o turno: o resumo do pedido
   * (`request_confirmation`) e a confirmação do pedido gravado (`place_order`).
   * Valores e itens saem de código, nunca parafraseados.
   */
  async generateAgentReply(input: AgentInput): Promise<AgentOutput> {
    const trace: ToolTrace[] = [];
    const startedAt = Date.now();
    const now = new Date();

    try {
      const promptContext = await this.context.loadPromptContext(
        input.tenantId,
        input.customer ?? null,
        input.contactName ?? null,
        now,
      );

      const llm = await this.llm.createChatLlm();
      if (typeof llm.bindTools !== "function") {
        throw new Error("modelo sem suporte a ferramentas");
      }
      const model = llm.bindTools(TOOL_DEFINITIONS);

      const messages: BaseMessage[] = [
        new SystemMessage(
          buildSystemPrompt({
            businessName: input.businessName,
            settings: input.settings,
            ...promptContext,
          }),
        ),
        ...historyToTurns(input.history).map((turn) =>
          turn.role === "user"
            ? new HumanMessage(turn.content)
            : new AIMessage(turn.content),
        ),
      ];

      const toolContext: ToolContext = {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        customer: input.customer ?? null,
        contactName: input.contactName ?? null,
        now,
      };

      // +1: a última rodada só pode produzir o texto final, sem ferramenta.
      for (let round = 0; round <= MAX_TOOL_ITERATIONS; round += 1) {
        if (Date.now() - startedAt > env.llm.timeoutMs * 2) {
          this.logger.error(
            "Agente estourou o prazo total, caindo no fallback.",
          );
          return { reply: null, trace };
        }

        // Prazo por chamada em TODOS os provedores (nem todo SDK tem opção própria).
        const ai = await model.invoke(messages, { timeout: env.llm.timeoutMs });
        const calls = ai.tool_calls ?? [];

        if (calls.length === 0) {
          const text = contentToText(ai.content).trim();
          return {
            reply: text.length === 0 ? null : text.slice(0, MAX_REPLY_CHARS),
            trace,
          };
        }

        if (round === MAX_TOOL_ITERATIONS) {
          this.logger.error(
            "Agente passou do limite de rodadas de ferramenta.",
          );
          return { reply: null, trace };
        }

        messages.push(ai);
        for (const [index, call] of calls.entries()) {
          const outcome = await this.tools.executeTool(
            toolContext,
            call.name,
            call.args,
          );
          trace.push({
            name: call.name,
            args: call.args,
            result: outcome.result,
          });

          // O sistema fala por cima do modelo: encerra o turno já.
          if (outcome.finalReply !== undefined) {
            return {
              reply: outcome.finalReply.slice(0, MAX_SYSTEM_REPLY_CHARS),
              trace,
            };
          }

          messages.push(
            new ToolMessage({
              content: JSON.stringify(outcome.result),
              tool_call_id: call.id ?? `call_${round}_${index}`,
              name: call.name,
            }),
          );
        }
      }
      return { reply: null, trace };
    } catch (err) {
      this.logger.error(
        `Agente indisponível, caindo no fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { reply: null, trace };
    }
  }
}
