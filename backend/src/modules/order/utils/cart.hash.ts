import { createHash } from "node:crypto";

import type { Cart } from "../types/cart.types.js";

/**
 * Hash estável do CONTEÚDO do carrinho (não de `status`/`summaryHash`/datas).
 * `place_order` só passa se o hash de agora for igual ao gravado quando o
 * resumo foi enviado: qualquer mudança depois do resumo força um novo resumo.
 *
 * `totalCents` entra de propósito: se o preço do cardápio mudar entre o resumo
 * e o "sim", o cliente não confirmou aquele valor.
 */
export function cartHash(cart: Cart, totalCents: number): string {
  const canonical = JSON.stringify({
    items: cart.items.map((l) => [
      l.itemId,
      l.sizeId,
      [...l.optionIds].sort((a, b) => a - b),
      l.quantity,
      l.notes,
    ]),
    fulfillment: cart.fulfillment,
    address: cart.address && [
      cart.address.street,
      cart.address.number,
      cart.address.complement,
      cart.address.reference,
      cart.address.neighborhood,
    ],
    zoneId: cart.zoneId,
    paymentMethod: cart.paymentMethod,
    changeForCents: cart.changeForCents,
    notes: cart.notes,
    totalCents,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
