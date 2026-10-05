import { formatBRL } from "../../../lib/money.js";

import type { Menu } from "../../menu/types/menu.types.js";
import type { HistoryMessage } from "../../conversation/types/conversation.types.js";
import type { BotSettings } from "../../settings/types/settings.types.js";

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

/** Quantos itens ativos cabem no prompt; acima disso o modelo usa só `search_menu`. */
export const MENU_IN_PROMPT_MAX_ITEMS = 60;

export interface LastOrderContext {
  number: number;
  /** "sábado", "ontem" — já resolvido no fuso da loja. */
  whenText: string;
  /** "1x Pizza Grande (Sabores: Calabresa + Marguerita)" — snapshot do pedido. */
  lines: string[];
}

export interface CustomerContext {
  name: string | null;
  /** Último endereço de entrega, já formatado. */
  lastAddress: string | null;
  lastOrder: LastOrderContext | null;
}

export interface StoreContext {
  open: boolean;
  paused: boolean;
  /** "hoje às 18h" — só quando fechada. */
  nextOpeningText: string | null;
  /** "terça-feira, 29/09, 19h32", no fuso da loja. */
  nowText: string;
}

export interface AgentContext {
  businessName: string;
  settings: BotSettings;
  store?: StoreContext;
  /** Cardápio resumido (nomes e preços, sem ids). `null` = cardápio grande, só `search_menu`. */
  menuSummary?: string | null;
  customer?: CustomerContext | null;
}

/** Nomes e preços por categoria. `null` se passar de `MENU_IN_PROMPT_MAX_ITEMS`. */
export function buildMenuSummary(menu: Menu): string | null {
  const categories = menu
    .filter((c) => c.active)
    .map((c) => ({ ...c, items: c.items.filter((i) => i.active) }))
    .filter((c) => c.items.length > 0);
  const total = categories.reduce((n, c) => n + c.items.length, 0);
  if (total === 0 || total > MENU_IN_PROMPT_MAX_ITEMS) return null;

  return categories
    .map((c) => {
      const items = c.items.map((item) => {
        const price =
          item.sizes.length > 0
            ? item.sizes
                .map((s) => `${s.name} ${formatBRL(s.priceCents)}`)
                .join(" / ")
            : item.priceCents !== null
              ? formatBRL(item.priceCents)
              : "";
        const sold = item.available ? "" : " [ESGOTADO]";
        return `- ${item.name}${price ? ` (${price})` : ""}${sold}`;
      });
      return [`${c.name}:`, ...items].join("\n");
    })
    .join("\n");
}

function customerBlock(customer: CustomerContext): string[] {
  const lines: string[] = ["", "Cliente desta conversa:"];
  lines.push(
    customer.name
      ? `- Nome: ${customer.name}`
      : "- Nome ainda desconhecido (pergunte antes de fechar o pedido, se natural).",
  );
  if (customer.lastAddress) {
    lines.push(
      `- Último endereço de entrega: ${customer.lastAddress}. Pergunte se é o mesmo antes de usar; só use com a confirmação dele.`,
    );
  }
  if (customer.lastOrder) {
    lines.push(
      `- Último pedido (#${customer.lastOrder.number}, ${customer.lastOrder.whenText}): ${customer.lastOrder.lines.join("; ")}. Você pode oferecer repetir, mas monte o carrinho com search_menu e add_item.`,
    );
  }
  return lines;
}

export function buildSystemPrompt({
  businessName,
  settings,
  store,
  menuSummary,
  customer,
}: AgentContext): string {
  const tone = TONE_BY_PERSONALITY[settings.personality];

  const lines = [
    `Você é ${settings.name}, atendente virtual do restaurante "${businessName}" no WhatsApp.`,
    `Tom: ${tone}. Responda em português do Brasil.`,
    "Mensagens curtas, como numa conversa de WhatsApp: no máximo 3 frases, sem markdown.",
  ];

  if (store) {
    lines.push("", `Agora: ${store.nowText}.`);
    if (store.open) {
      lines.push("A loja está ABERTA.");
    } else if (store.paused) {
      lines.push(
        "A loja está FECHADA no momento (pausada pelo restaurante). Você pode mostrar o cardápio, mas não feche pedido.",
      );
    } else {
      lines.push(
        `A loja está FECHADA agora${store.nextOpeningText ? ` (abre ${store.nextOpeningText})` : ""}. Você pode mostrar o cardápio e montar o carrinho, mas o pedido só é fechado com a loja aberta.`,
      );
    }
  }

  if (menuSummary) {
    lines.push(
      "",
      "Cardápio (resumo — para pedir você PRECISA dos ids: use search_menu):",
      menuSummary,
    );
  }

  lines.push(
    "",
    "Como atender:",
    "0. Cliente que quer pedir ou ver o cardápio: use send_menu_link. Ele abre o cardápio com fotos, monta o carrinho e volta aqui. O SISTEMA envia o link; depois dessa chamada você NÃO escreve nada. Se o send_menu_link falhar, ou se o cliente prefere digitar o pedido, siga o passo a passo abaixo.",
    "Se view_cart já mostra itens (montados pelo cardápio), NÃO peça o pedido de novo: continue de onde parou (entrega ou retirada, endereço, pagamento) e depois request_confirmation.",
    "1. Entenda o que o cliente quer e use search_menu para achar os itens e seus ids. Pergunte o tamanho e as opções obrigatórias (ex.: sabores) que faltarem.",
    "2. Adicione com add_item. Pizza meio a meio: um item, duas opções no grupo de sabores.",
    "3. Pergunte se é entrega ou retirada. Entrega: peça rua, número e bairro e use set_fulfillment.",
    "4. Pergunte a forma de pagamento e use set_payment. Dinheiro: pergunte se precisa de troco.",
    "5. Com o carrinho completo, chame request_confirmation. O SISTEMA envia o resumo ao cliente; depois dessa chamada você NÃO escreve nada.",
    "6. Quando o cliente confirmar o resumo (sim, pode, confirmo), chame place_order. Se ele pedir qualquer mudança, ajuste o carrinho e chame request_confirmation de novo.",
    "",
    "Regras que você NUNCA quebra:",
    "- Nunca invente item, preço, taxa, horário ou prazo: use as ferramentas (search_menu, store_info, view_cart).",
    "- Nunca calcule valores. Repita exatamente os valores que as ferramentas devolvem.",
    "- Nunca diga que o pedido foi feito ou confirmado antes de place_order ter dado certo.",
    "- Se uma ferramenta devolver erro, explique ao cliente em uma frase e proponha a saída (ex.: outro tamanho, retirada no lugar de entrega).",
    "- Se o cliente pedir uma pessoa, reclamar, ou o assunto fugir de pedidos, use call_human.",
    "- Não diga que é humano. Se perguntarem, diga que é a atendente virtual.",
  );

  if (customer) lines.push(...customerBlock(customer));

  return lines.join("\n");
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
