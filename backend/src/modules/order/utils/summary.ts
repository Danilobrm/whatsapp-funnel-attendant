import { formatBRL } from "../../../lib/money.js";

import type { PaymentMethod } from "../../store/types/store.types.js";
import type { Cart } from "../types/cart.types.js";
import type { PricedCart, PricedLine } from "./pricing.js";

/**
 * Resumo do pedido que o CLIENTE confirma. Texto montado por código, nunca
 * pelo LLM: valores e itens não podem sair "parafraseados". Termina com a
 * pergunta de confirmação, que é o que arma o `place_order`.
 */

export const CONFIRMATION_QUESTION = "Posso confirmar?";

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card_on_delivery: "Cartão na entrega",
};

export function paymentLabel(method: PaymentMethod): string {
  return PAYMENT_LABEL[method];
}

/** "Sabores: Calabresa + Quatro Queijos · Borda: Catupiry" */
function optionsText(line: PricedLine): string {
  const groups = new Map<string, string[]>();
  for (const option of line.options) {
    const names = groups.get(option.group) ?? [];
    names.push(option.name);
    groups.set(option.group, names);
  }
  return [...groups.entries()]
    .map(([group, names]) => `${group}: ${names.join(" + ")}`)
    .join(" · ");
}

function lineText(line: PricedLine): string[] {
  const name = line.sizeName ? `${line.name} ${line.sizeName}` : line.name;
  const out = [`${line.quantity}x ${name} — ${formatBRL(line.lineTotalCents)}`];
  const options = optionsText(line);
  if (options) out.push(`   ${options}`);
  if (line.notes) out.push(`   Obs: ${line.notes}`);
  return out;
}

function addressText(cart: Cart): string | null {
  const address = cart.address;
  if (!address) return null;
  const street = [address.street, address.number].filter(Boolean).join(", ");
  const parts = [street];
  if (address.complement) parts.push(address.complement);
  if (address.neighborhood) parts.push(address.neighborhood);
  const text = parts.join(" - ");
  return address.reference ? `${text} (ref.: ${address.reference})` : text;
}

export function formatOrderSummary(priced: PricedCart, cart: Cart): string {
  const out: string[] = ["Resumo do seu pedido:", ""];

  for (const line of priced.lines) out.push(...lineText(line));

  out.push("");
  out.push(`Subtotal: ${formatBRL(priced.subtotalCents)}`);
  if (cart.fulfillment === "delivery") {
    out.push(`Taxa de entrega: ${formatBRL(priced.feeCents)}`);
  }
  out.push(`Total: ${formatBRL(priced.totalCents)}`);
  out.push("");

  if (cart.fulfillment === "delivery") {
    out.push(`Entrega em: ${addressText(cart) ?? "endereço não informado"}`);
  } else {
    out.push("Retirada no balcão");
  }

  if (cart.paymentMethod !== null) {
    const payment = paymentLabel(cart.paymentMethod);
    out.push(
      cart.paymentMethod === "cash" && cart.changeForCents !== null
        ? `Pagamento: ${payment} (troco para ${formatBRL(cart.changeForCents)})`
        : cart.paymentMethod === "cash"
          ? `Pagamento: ${payment} (sem troco)`
          : `Pagamento: ${payment}`,
    );
  }
  if (cart.notes) out.push(`Obs. do pedido: ${cart.notes}`);

  out.push("", CONFIRMATION_QUESTION);
  return out.join("\n");
}

/**
 * Resposta do sistema quando o pedido é gravado. Fala "recebemos", não "está
 * sendo preparado": o pedido nasce `pending` e só vira `accepted` quando o
 * balcão aceita — aí `customerMessageFor` avisa o cliente.
 */
export function formatOrderPlaced(
  order: { number: number; totalCents: number; paymentMethod: string },
  estimatedMinutes: number,
  pixKey: string | null,
): string {
  const out = [
    `Pedido #${order.number} recebido! Total: ${formatBRL(order.totalCents)}.`,
  ];
  if (order.paymentMethod === "pix" && pixKey) {
    out.push(`Pagamento por Pix — chave: ${pixKey}`);
  }
  out.push(
    `Assim que a loja confirmar, avisamos por aqui. Tempo estimado: ${estimatedMinutes} min.`,
  );
  return out.join("\n");
}
