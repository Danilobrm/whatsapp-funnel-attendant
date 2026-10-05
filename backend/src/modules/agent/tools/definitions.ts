/**
 * Contrato das ferramentas que o modelo enxerga (formato "function" da OpenAI,
 * aceito por ChatOllama / ChatAnthropic / ChatOpenAI). Descrições em pt-BR,
 * curtas: modelo pequeno segue melhor instrução direta.
 */

export const TOOL_NAMES = [
  "send_menu_link",
  "search_menu",
  "add_item",
  "remove_item",
  "update_quantity",
  "view_cart",
  "set_fulfillment",
  "set_payment",
  "request_confirmation",
  "place_order",
  "store_info",
  "call_human",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

interface ToolDefinition {
  type: "function";
  function: {
    name: ToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function def(
  name: ToolName,
  description: string,
  properties: Record<string, unknown> = {},
  required: string[] = [],
): ToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, required },
    },
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  def(
    "send_menu_link",
    "Envia ao cliente o link do cardápio com fotos, tamanhos e adicionais, onde ele monta o carrinho e depois volta ao chat. PREFIRA esta ferramenta quando o cliente quer pedir ou ver o cardápio. O SISTEMA envia a mensagem com o link — depois desta chamada NÃO escreva nada.",
  ),
  def(
    "search_menu",
    "Busca itens no cardápio por nome, categoria, sabor ou tamanho. Devolve ids, preços, tamanhos e grupos de opções. Sem query, devolve as categorias e os itens. Use SEMPRE antes de add_item.",
    {
      query: {
        type: "string",
        description: "Ex.: 'calabresa', 'refrigerante'",
      },
    },
  ),
  def(
    "add_item",
    "Adiciona um item ao carrinho. Se o item tem tamanhos, size_id é obrigatório. Grupos de opções com mínimo (ex.: sabores) exigem option_ids. Devolve o carrinho ou o que falta.",
    {
      item_id: { type: "integer" },
      size_id: { type: "integer", description: "Só se o item tem tamanhos" },
      option_ids: {
        type: "array",
        items: { type: "integer" },
        description: "Ids das opções escolhidas (sabores, borda, adicionais)",
      },
      quantity: { type: "integer", description: "Padrão 1" },
      notes: {
        type: "string",
        description: "Observação do cliente para este item",
      },
    },
    ["item_id"],
  ),
  def(
    "remove_item",
    "Remove uma linha do carrinho pelo número que aparece em view_cart (começa em 1).",
    { line_number: { type: "integer" } },
    ["line_number"],
  ),
  def(
    "update_quantity",
    "Muda a quantidade de uma linha do carrinho (1 a 50). Para tirar a linha use remove_item.",
    { line_number: { type: "integer" }, quantity: { type: "integer" } },
    ["line_number", "quantity"],
  ),
  def(
    "view_cart",
    "Mostra o carrinho atual com valores, entrega, pagamento e o que ainda falta.",
  ),
  def(
    "set_fulfillment",
    "Define entrega (delivery) ou retirada (pickup). Para entrega informe o endereço e o bairro; a taxa é calculada pelo bairro.",
    {
      type: { type: "string", enum: ["delivery", "pickup"] },
      address: {
        type: "object",
        properties: {
          street: { type: "string" },
          number: { type: "string" },
          complement: { type: "string" },
          reference: { type: "string" },
        },
      },
      neighborhood: { type: "string", description: "Bairro da entrega" },
    },
    ["type"],
  ),
  def(
    "set_payment",
    "Define a forma de pagamento: pix, cash (dinheiro) ou card_on_delivery (cartão na entrega). Para dinheiro, change_for_reais é o valor da nota do cliente (troco para quanto).",
    {
      method: { type: "string", enum: ["pix", "cash", "card_on_delivery"] },
      change_for_reais: {
        type: "number",
        description: "Só para cash. Ex.: 100",
      },
    },
    ["method"],
  ),
  def(
    "request_confirmation",
    "Pede o resumo final ao sistema. Só funciona com o carrinho completo. O SISTEMA envia o resumo ao cliente — depois desta chamada NÃO escreva nada.",
  ),
  def(
    "place_order",
    "Fecha o pedido. Chame SOMENTE depois que o cliente respondeu que confirma o resumo enviado. O sistema envia a confirmação ao cliente.",
  ),
  def(
    "store_info",
    "Informa se a loja está aberta, horários, tempo estimado, pedido mínimo, formas de pagamento, entrega/retirada e bairros atendidos com taxa.",
  ),
  def(
    "call_human",
    "Chama um atendente humano quando o cliente pede, reclama, ou o pedido foge do que você consegue resolver.",
    { reason: { type: "string" } },
    ["reason"],
  ),
];
