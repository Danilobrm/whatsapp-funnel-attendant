import { Injectable, Logger } from "@nestjs/common";

import { MenuService } from "../../menu/services/menu.service.js";
import { MenuLinkRepository } from "../../menulink/repositories/menuLink.repository.js";
import { MenuLinkService } from "../../menulink/services/menuLink.service.js";
import { CartRepository } from "../../order/repositories/cart.repository.js";
import { CartService } from "../../order/services/cart.service.js";
import { OrderService } from "../../order/services/order.service.js";
import { StoreService } from "../../store/services/store.service.js";
import { CustomerRepository } from "../../customer/repositories/customer.repository.js";
import { formatMenuLinkMessage } from "../../menulink/utils/menuLink.pure.js";
import { cartHash } from "../../order/utils/cart.hash.js";
import {
  findMenuItem,
  MAX_LINE_QUANTITY,
  priceCart,
} from "../../order/utils/pricing.js";
import {
  formatOrderPlaced,
  formatOrderSummary,
  paymentLabel,
} from "../../order/utils/summary.js";
import { normalizeNeighborhood } from "../../store/utils/neighborhood.js";
import {
  describeHours,
  describeNextOpening,
  isOpenAt,
  nextOpening,
} from "../../store/utils/store.hours.js";
import { formatBRL } from "../../../lib/money.js";
import {
  parseAddItem,
  parseCallHuman,
  parseLineNumber,
  parseSearchMenu,
  parseSetFulfillment,
  parseSetPayment,
  parseUpdateQuantity,
} from "./args.js";
import { isToolName } from "./definitions.js";
import {
  cartView,
  describeProblem,
  menuItemView,
  searchMenu,
} from "./views.js";
import type { Customer } from "../../customer/types/customer.types.js";
import type { Menu } from "../../menu/types/menu.types.js";
import type { Cart } from "../../order/types/cart.types.js";
import type {
  DeliveryZone,
  StoreSettings,
} from "../../store/types/store.types.js";
import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { PricedCart } from "../../order/utils/pricing.js";
import type { OrderItem } from "../../order/types/order.types.js";

export interface ToolContext {
  tenantId: TenantId;
  conversationId: number;
  customer: Customer | null;
  /** Nome do perfil do canal (WhatsApp) — usado se `customer.name` faltar. */
  contactName: string | null;
  now: Date;
}

export interface ToolOutcome {
  /** JSON que volta ao modelo como resultado da ferramenta. */
  result: Record<string, unknown>;
  /**
   * Texto que o SISTEMA envia ao cliente e que ENCERRA o turno do agente
   * (resumo do pedido, confirmação de pedido gravado). O modelo não escreve
   * nada por cima: valores e itens não podem sair parafraseados.
   */
  finalReply?: string;
}

interface Snapshot {
  menu: Menu;
  settings: StoreSettings;
  zones: DeliveryZone[];
  cart: Cart;
}

function zoneOf(cart: Cart, zones: DeliveryZone[]): DeliveryZone | null {
  return zones.find((z) => z.id === cart.zoneId) ?? null;
}

function price(s: Snapshot, cart: Cart = s.cart): PricedCart {
  return priceCart(cart, s.menu, zoneOf(cart, s.zones), s.settings);
}

const err = (
  error: string,
  extra: Record<string, unknown> = {},
): ToolOutcome => ({
  result: { ok: false, error, ...extra },
});

/** Resolve o bairro digitado pelo cliente numa zona: exata primeiro, depois única por substring. */
export function resolveZone(
  zones: readonly DeliveryZone[],
  raw: string,
): DeliveryZone | null {
  const key = normalizeNeighborhood(raw);
  if (key.length === 0) return null;
  const exact = zones.find(
    (z) => normalizeNeighborhood(z.neighborhood) === key,
  );
  if (exact) return exact;
  if (key.length < 4) return null;
  const partial = zones.filter((z) => {
    const zoneKey = normalizeNeighborhood(z.neighborhood);
    return zoneKey.includes(key) || key.includes(zoneKey);
  });
  return partial.length === 1 ? (partial[0] ?? null) : null;
}

// ------------------------------------------------------------- ferramentas

function toolSearchMenu(s: Snapshot, raw: unknown): ToolOutcome {
  const args = parseSearchMenu(raw);
  if (!args.ok) return err("invalid_args", { detail: args.error });
  return { result: { ok: true, ...searchMenu(s.menu, args.value.query) } };
}

function toolViewCart(s: Snapshot): ToolOutcome {
  return { result: { ok: true, cart: cartView(s.cart, price(s)) } };
}

/** Loja fechada/pausada: recusa com o próximo horário. `null` = aberta. */
function closedRefusal(s: Snapshot, now: Date): ToolOutcome | null {
  if (isOpenAt(s.settings, now)) return null;
  if (s.settings.paused) return err("store_paused");
  const next = nextOpening(s.settings, now);
  return err("store_closed", {
    nextOpening: next
      ? describeNextOpening(next, now, s.settings.timezone)
      : null,
    detail:
      "o cliente pode ver o cardápio e montar o pedido, mas ele só é fechado com a loja aberta",
  });
}

function toolStoreInfo(s: Snapshot, now: Date): ToolOutcome {
  const open = isOpenAt(s.settings, now);
  const next = open ? null : nextOpening(s.settings, now);
  return {
    result: {
      ok: true,
      open,
      paused: s.settings.paused,
      nextOpening: next
        ? describeNextOpening(next, now, s.settings.timezone)
        : null,
      hours: describeHours(s.settings),
      estimatedMinutes: s.settings.estimatedMinutes,
      minOrder: formatBRL(s.settings.minOrderCents),
      paymentMethods: s.settings.paymentMethods.map(paymentLabel),
      pixKey: s.settings.pixKey,
      deliveryEnabled: s.settings.deliveryEnabled,
      pickupEnabled: s.settings.pickupEnabled,
      address: s.settings.address,
      deliveryNeighborhoods: s.zones
        .filter((z) => z.active)
        .slice(0, 60)
        .map((z) => ({
          neighborhood: z.neighborhood,
          fee: formatBRL(z.feeCents),
        })),
    },
  };
}

const logger = new Logger("AgentToolExecutor");

function toolCallHuman(ctx: ToolContext, raw: unknown): ToolOutcome {
  const args = parseCallHuman(raw);
  if (!args.ok) return err("invalid_args", { detail: args.error });
  // Fase 4 marca o handoff na conversa; até lá só fica registrado.
  logger.log(
    `[handoff] tenant ${ctx.tenantId} conversa ${ctx.conversationId}: ${args.value.reason}`,
  );
  return {
    result: {
      ok: true,
      detail: "registrado; avise ao cliente que a equipe vai retornar em breve",
    },
  };
}

@Injectable()
export class AgentToolExecutor {
  constructor(
    private readonly menu: MenuService,
    private readonly menuLinks: MenuLinkRepository,
    private readonly menuLinkService: MenuLinkService,
    private readonly carts: CartRepository,
    private readonly cartService: CartService,
    private readonly orders: OrderService,
    private readonly store: StoreService,
    private readonly customers: CustomerRepository,
  ) {}

  private async loadSnapshot(ctx: ToolContext): Promise<Snapshot> {
    const [menu, settings, zones, cart] = await Promise.all([
      this.menu.getPublishedMenu(ctx.tenantId),
      this.store.getStoreSettings(ctx.tenantId),
      this.store.listZones(ctx.tenantId),
      this.cartService.getCart(ctx.tenantId, ctx.conversationId, ctx.now),
    ]);
    return { menu, settings, zones, cart };
  }

  private async toolAddItem(
    ctx: ToolContext,
    s: Snapshot,
    raw: unknown,
  ): Promise<ToolOutcome> {
    const args = parseAddItem(raw);
    if (!args.ok) return err("invalid_args", { detail: args.error });
    const { itemId, sizeId, optionIds, quantity, notes } = args.value;

    if (quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      return err("invalid_quantity", {
        detail: `use de 1 a ${MAX_LINE_QUANTITY}`,
      });
    }
    const item = findMenuItem(s.menu, itemId);
    if (!item)
      return err("item_not_found", {
        detail: "use search_menu para ver os ids",
      });
    if (!item.available) return err("item_unavailable", { item: item.name });

    const sameLine = s.cart.items.findIndex(
      (l) =>
        l.itemId === itemId &&
        l.sizeId === sizeId &&
        l.notes === notes &&
        l.optionIds.length === optionIds.length &&
        [...l.optionIds].sort().join() === [...optionIds].sort().join(),
    );

    const items =
      sameLine >= 0
        ? s.cart.items.map((l, i) =>
            i === sameLine ? { ...l, quantity: l.quantity + quantity } : l,
          )
        : [...s.cart.items, { itemId, sizeId, optionIds, quantity, notes }];
    const candidate: Cart = { ...s.cart, items };

    const priced = price(s, candidate);
    const lineIndex = sameLine >= 0 ? sameLine : items.length - 1;
    const lineProblems = priced.problems.filter(
      (p) => p.lineIndex === lineIndex,
    );
    if (lineProblems.length > 0) {
      return err("item_incomplete", {
        problems: lineProblems.map(describeProblem),
        item: menuItemView(item, ""),
      });
    }

    const saved = await this.cartService.saveEditedCart(
      ctx.tenantId,
      ctx.conversationId,
      candidate,
    );
    return { result: { ok: true, cart: cartView(saved, priced) } };
  }

  private async toolRemoveItem(
    ctx: ToolContext,
    s: Snapshot,
    raw: unknown,
  ): Promise<ToolOutcome> {
    const args = parseLineNumber(raw);
    if (!args.ok) return err("invalid_args", { detail: args.error });
    const index = args.value.line - 1;
    if (index >= s.cart.items.length) return err("line_not_found");

    const candidate: Cart = {
      ...s.cart,
      items: s.cart.items.filter((_, i) => i !== index),
    };
    const saved = await this.cartService.saveEditedCart(
      ctx.tenantId,
      ctx.conversationId,
      candidate,
    );
    return { result: { ok: true, cart: cartView(saved, price(s, saved)) } };
  }

  private async toolUpdateQuantity(
    ctx: ToolContext,
    s: Snapshot,
    raw: unknown,
  ): Promise<ToolOutcome> {
    const args = parseUpdateQuantity(raw);
    if (!args.ok) return err("invalid_args", { detail: args.error });
    const { line, quantity } = args.value;
    const index = line - 1;
    if (index >= s.cart.items.length) return err("line_not_found");
    if (quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      return err("invalid_quantity", {
        detail: `use de 1 a ${MAX_LINE_QUANTITY}; para tirar a linha use remove_item`,
      });
    }

    const candidate: Cart = {
      ...s.cart,
      items: s.cart.items.map((l, i) => (i === index ? { ...l, quantity } : l)),
    };
    const saved = await this.cartService.saveEditedCart(
      ctx.tenantId,
      ctx.conversationId,
      candidate,
    );
    return { result: { ok: true, cart: cartView(saved, price(s, saved)) } };
  }

  private async toolSetFulfillment(
    ctx: ToolContext,
    s: Snapshot,
    raw: unknown,
  ): Promise<ToolOutcome> {
    const args = parseSetFulfillment(raw);
    if (!args.ok) return err("invalid_args", { detail: args.error });
    const a = args.value;

    if (a.type === "pickup") {
      if (!s.settings.pickupEnabled) return err("pickup_unavailable");
      const saved = await this.cartService.saveEditedCart(
        ctx.tenantId,
        ctx.conversationId,
        {
          ...s.cart,
          fulfillment: "pickup",
          address: null,
          zoneId: null,
        },
      );
      return {
        result: {
          ok: true,
          pickupAddress: s.settings.address,
          cart: cartView(saved, price(s, saved)),
        },
      };
    }

    if (!s.settings.deliveryEnabled) return err("delivery_unavailable");
    if (a.street === null)
      return err("street_required", { detail: "peça rua e número" });
    if (a.neighborhood === null)
      return err("neighborhood_required", { detail: "peça o bairro" });

    const zone = resolveZone(s.zones, a.neighborhood);
    if (!zone || !zone.active) {
      return err("neighborhood_not_served", {
        informed: a.neighborhood,
        servedNeighborhoods: s.zones
          .filter((z) => z.active)
          .map((z) => z.neighborhood),
        detail: "ofereça retirada ou peça outro endereço",
      });
    }

    const saved = await this.cartService.saveEditedCart(
      ctx.tenantId,
      ctx.conversationId,
      {
        ...s.cart,
        fulfillment: "delivery",
        zoneId: zone.id,
        address: {
          street: a.street,
          number: a.number,
          complement: a.complement,
          reference: a.reference,
          neighborhood: zone.neighborhood,
        },
      },
    );
    return {
      result: {
        ok: true,
        deliveryFee: formatBRL(zone.feeCents),
        cart: cartView(saved, price(s, saved)),
      },
    };
  }

  private async toolSetPayment(
    ctx: ToolContext,
    s: Snapshot,
    raw: unknown,
  ): Promise<ToolOutcome> {
    const args = parseSetPayment(raw);
    if (!args.ok) return err("invalid_args", { detail: args.error });
    const { method, changeForCents } = args.value;

    if (!s.settings.paymentMethods.includes(method)) {
      return err("payment_unavailable", {
        accepted: s.settings.paymentMethods.map(paymentLabel),
      });
    }

    const candidate: Cart = {
      ...s.cart,
      paymentMethod: method,
      changeForCents: method === "cash" ? changeForCents : null,
    };
    const priced = price(s, candidate);
    if (
      changeForCents !== null &&
      priced.problems.some((p) => p.code === "change_too_low")
    ) {
      return err("change_too_low", {
        total: formatBRL(priced.totalCents),
        detail: "o troco precisa ser para um valor maior ou igual ao total",
      });
    }

    const saved = await this.cartService.saveEditedCart(
      ctx.tenantId,
      ctx.conversationId,
      candidate,
    );
    return { result: { ok: true, cart: cartView(saved, priced) } };
  }

  private async toolRequestConfirmation(
    ctx: ToolContext,
    s: Snapshot,
  ): Promise<ToolOutcome> {
    const closed = closedRefusal(s, ctx.now);
    if (closed) return closed;

    const priced = price(s);
    if (priced.problems.length > 0) {
      return err("cart_incomplete", {
        problems: priced.problems.map(describeProblem),
      });
    }

    const summaryHash = cartHash(s.cart, priced.totalCents);
    await this.carts.saveCart(ctx.tenantId, ctx.conversationId, {
      ...s.cart,
      status: "awaiting_confirmation",
      summaryHash,
    });
    return {
      result: { ok: true, summarySent: true },
      finalReply: formatOrderSummary(priced, s.cart),
    };
  }

  private async toolPlaceOrder(
    ctx: ToolContext,
    s: Snapshot,
  ): Promise<ToolOutcome> {
    const closed = closedRefusal(s, ctx.now);
    if (closed) return closed;

    if (
      s.cart.status !== "awaiting_confirmation" ||
      s.cart.summaryHash === null
    ) {
      return err("not_confirmed", {
        detail: "o cliente ainda não viu o resumo; chame request_confirmation",
      });
    }
    const priced = price(s);
    if (priced.problems.length > 0) {
      return err("cart_incomplete", {
        problems: priced.problems.map(describeProblem),
      });
    }
    // Preço/cardápio mudou (ou o carrinho foi alterado) depois do resumo.
    if (cartHash(s.cart, priced.totalCents) !== s.cart.summaryHash) {
      await this.cartService.saveEditedCart(
        ctx.tenantId,
        ctx.conversationId,
        s.cart,
      );
      return err("cart_changed_after_summary", {
        detail:
          "chame request_confirmation de novo para o cliente ver o resumo atualizado",
      });
    }

    const claimed = await this.carts.claimConfirmedCart(
      ctx.tenantId,
      ctx.conversationId,
      s.cart.summaryHash,
    );
    // Outra mensagem concorrente já fechou este mesmo pedido.
    if (!claimed) return err("not_confirmed");

    const cart = s.cart;
    const address = cart.address;
    const items: OrderItem[] = priced.lines.map((l) => ({
      name: l.name,
      sizeName: l.sizeName,
      unitPriceCents: l.unitPriceCents,
      quantity: l.quantity,
      options: l.options,
      notes: l.notes,
    }));

    let order;
    try {
      order = await this.orders.createOrder(ctx.tenantId, {
        conversationId: ctx.conversationId,
        customerId: ctx.customer?.id ?? null,
        customerName:
          ctx.customer?.name?.trim() || ctx.contactName?.trim() || "Cliente",
        customerPhone: ctx.customer?.phone ?? null,
        fulfillment: cart.fulfillment ?? "pickup",
        address: address
          ? {
              street: address.street,
              number: address.number,
              complement: address.complement,
              reference: address.reference,
            }
          : null,
        neighborhood: address?.neighborhood ?? null,
        paymentMethod: cart.paymentMethod ?? "pix",
        changeForCents: cart.changeForCents,
        subtotalCents: priced.subtotalCents,
        feeCents: priced.feeCents,
        totalCents: priced.totalCents,
        notes: cart.notes,
        items,
      });
    } catch (e) {
      // O pedido não foi criado: devolve o carrinho confirmado ao cliente.
      await this.carts.saveCart(ctx.tenantId, ctx.conversationId, cart);
      throw e;
    }

    if (ctx.customer && address) {
      // Guardar o endereço é conveniência: não desfaz um pedido já criado.
      try {
        await this.customers.updateCustomerLastAddress(
          ctx.tenantId,
          ctx.customer.id,
          address,
        );
      } catch (e) {
        logger.error(
          `Falha ao guardar o último endereço: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // Funil do cardápio em link: só conta se o carrinho veio da página.
    try {
      await this.menuLinks.insertMenuLinkOrdered(
        ctx.tenantId,
        ctx.conversationId,
      );
    } catch (e) {
      logger.error(
        `Falha ao registrar o pedido no funil do cardápio: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return {
      result: { ok: true, orderNumber: order.number },
      finalReply: formatOrderPlaced(
        order,
        s.settings.estimatedMinutes,
        s.settings.pixKey,
      ),
    };
  }

  private async toolSendMenuLink(ctx: ToolContext): Promise<ToolOutcome> {
    const url = await this.menuLinkService.createMenuLink(
      ctx.tenantId,
      ctx.conversationId,
    );
    if (url === null) {
      return err("menu_link_unavailable", {
        detail:
          "sem link agora; siga o pedido pelo chat com search_menu e add_item",
      });
    }
    // Texto do SISTEMA: a URL não pode sair alterada pelo modelo.
    return {
      result: { ok: true, linkSent: true },
      finalReply: formatMenuLinkMessage(url),
    };
  }

  /**
   * Executa uma ferramenta. Nunca lança: o modelo recebe `{ ok: false, error }`
   * e decide o que dizer, em vez de a conversa inteira cair no fallback.
   */
  async executeTool(
    ctx: ToolContext,
    name: string,
    rawArgs: unknown,
  ): Promise<ToolOutcome> {
    if (!isToolName(name)) return err("unknown_tool", { tool: name });

    try {
      const s = await this.loadSnapshot(ctx);
      switch (name) {
        case "send_menu_link":
          return await this.toolSendMenuLink(ctx);
        case "search_menu":
          return toolSearchMenu(s, rawArgs);
        case "add_item":
          return await this.toolAddItem(ctx, s, rawArgs);
        case "remove_item":
          return await this.toolRemoveItem(ctx, s, rawArgs);
        case "update_quantity":
          return await this.toolUpdateQuantity(ctx, s, rawArgs);
        case "view_cart":
          return toolViewCart(s);
        case "set_fulfillment":
          return await this.toolSetFulfillment(ctx, s, rawArgs);
        case "set_payment":
          return await this.toolSetPayment(ctx, s, rawArgs);
        case "request_confirmation":
          return await this.toolRequestConfirmation(ctx, s);
        case "place_order":
          return await this.toolPlaceOrder(ctx, s);
        case "store_info":
          return toolStoreInfo(s, ctx.now);
        case "call_human":
          return toolCallHuman(ctx, rawArgs);
      }
    } catch (e) {
      logger.error(
        `ferramenta ${name} falhou: ${e instanceof Error ? e.message : String(e)}`,
      );
      return err("tool_failed");
    }
  }
}
