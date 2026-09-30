import { Injectable } from "@nestjs/common";

import { CartRepository } from "../repositories/cart.repository.js";
import { emptyCart, isCartExpired } from "../types/cart.types.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { Cart } from "../types/cart.types.js";

@Injectable()
export class CartService {
  constructor(private readonly carts: CartRepository) {}

  /**
   * Carrinho da conversa. Sem atividade por 3h (`CART_TTL_MS`) é descartado NA
   * LEITURA — sem job, sem timer: quem volta no dia seguinte começa do zero.
   */
  async getCart(
    tenantId: TenantId,
    conversationId: number,
    now: Date = new Date(),
  ): Promise<Cart> {
    const stored = await this.carts.findCart(tenantId, conversationId);
    if (stored === null) return emptyCart();
    if (isCartExpired(stored.updatedAt, now)) {
      await this.carts.deleteCart(tenantId, conversationId);
      return emptyCart();
    }
    return stored;
  }

  /**
   * Toda mutação do conteúdo volta o carrinho para `open` e invalida o resumo:
   * o cliente só confirma o que viu.
   */
  async saveEditedCart(
    tenantId: TenantId,
    conversationId: number,
    cart: Cart,
  ): Promise<Cart> {
    const next: Cart = { ...cart, status: "open", summaryHash: null };
    await this.carts.saveCart(tenantId, conversationId, next);
    return next;
  }
}
