import type { Order, OrderStatus, RejectReason } from "../types/order.types.js";

/**
 * Texto que o CLIENTE recebe a cada mudança de status. É fala do atendente
 * (pt-BR, idioma do bot), não UI do painel — por isso não passa pelo i18n do
 * frontend, como `UNSUPPORTED_MEDIA_REPLY`.
 */
const REJECT_REASON_TEXT: Record<RejectReason, string> = {
  sold_out: "um item do pedido acabou",
  out_of_area: "o endereço está fora da nossa área de entrega",
  closing: "estamos encerrando o atendimento",
  other: "não conseguimos atender agora",
};

export function customerMessageFor(
  order: Pick<Order, "number" | "status" | "rejectReason" | "rejectNote">,
  estimatedMinutes: number,
): string | null {
  const n = `#${order.number}`;
  const messages: Partial<Record<OrderStatus, string>> = {
    accepted: `Pedido ${n} confirmado! Já estamos preparando. Tempo estimado: ${estimatedMinutes} min.`,
    rejected: rejectText(order),
    out_for_delivery: `Seu pedido ${n} saiu para entrega! 🛵`,
    ready_for_pickup: `Seu pedido ${n} está pronto para retirada!`,
    completed: `Pedido ${n} concluído. Obrigado pela preferência! 😊`,
    cancelled: `O pedido ${n} foi cancelado. Se precisar, é só chamar por aqui.`,
  };
  return messages[order.status] ?? null;
}

function rejectText(
  order: Pick<Order, "number" | "rejectReason" | "rejectNote">,
): string {
  const reason =
    order.rejectReason === "other" && order.rejectNote
      ? order.rejectNote
      : REJECT_REASON_TEXT[order.rejectReason ?? "other"];
  return `Infelizmente não conseguimos aceitar o pedido #${order.number}: ${reason}. Desculpe o transtorno!`;
}
