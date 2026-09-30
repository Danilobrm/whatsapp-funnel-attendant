import { Injectable, Logger } from "@nestjs/common";

import { env } from "../../../config/env.js";
import { UnauthorizedError } from "../../auth/errors/auth.errors.js";
import { ConversationRepository } from "../../conversation/repositories/conversation.repository.js";
import { OutboundMessenger } from "../../conversation/services/outbound.service.js";
import { MenuService } from "../../menu/services/menu.service.js";
import { CartService } from "../../order/services/cart.service.js";
import { priceCart } from "../../order/utils/pricing.js";
import { StoreService } from "../../store/services/store.service.js";
import { isOpenAt, nextOpening } from "../../store/utils/store.hours.js";
import { TenantRepository } from "../../tenants/repositories/tenant.repository.js";
import { asTenantId } from "../../tenants/types/tenant.types.js";
import { InvalidPublicCartError } from "../errors/menuLink.errors.js";
import { MenuLinkRepository } from "../repositories/menuLink.repository.js";
import {
  generateMenuLinkCode,
  isWellFormedCode,
  MENU_LINK_TTL_MS,
} from "../utils/menuLink.code.js";
import {
  blockingProblems,
  formatCartReceived,
  parseCartItems,
  RETURN_TEXT,
  toPublicMenu,
  whatsAppReturnUrl,
} from "../utils/menuLink.pure.js";

import type { CartLine } from "../../order/types/cart.types.js";
import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { PublicCategory } from "../utils/menuLink.pure.js";

/** Tentativas de achar um código livre (colisão de 72 bits: na prática nunca passa da 1ª). */
const MAX_CODE_ATTEMPTS = 5;

interface Session {
  tenantId: TenantId;
  conversationId: number;
  channel: "whatsapp" | "simulator";
}

export interface PublicMenuView {
  restaurant: {
    name: string;
    logoUrl: string | null;
    open: boolean;
    paused: boolean;
    /** Próxima abertura (ISO), só quando fechada; a página formata no fuso. */
    nextOpening: string | null;
    timezone: string;
    minOrderCents: number;
  };
  menu: PublicCategory[];
  /** Linhas já no carrinho da conversa — reabrir o link retoma de onde parou. */
  cart: { items: CartLine[] };
  /** `wa.me` de volta ao chat. `null` no simulador ou sem número cadastrado. */
  whatsappUrl: string | null;
}

export interface ConfirmedCartView {
  lines: {
    name: string;
    sizeName: string | null;
    quantity: number;
    totalCents: number;
  }[];
  subtotalCents: number;
  /** A mensagem "Recebi seu carrinho" chegou no chat? `false` → a página reforça o botão de voltar. */
  notified: boolean;
  whatsappUrl: string | null;
}

@Injectable()
export class MenuLinkService {
  private readonly logger = new Logger(MenuLinkService.name);

  constructor(
    private readonly links: MenuLinkRepository,
    private readonly conversations: ConversationRepository,
    private readonly outbound: OutboundMessenger,
    private readonly menu: MenuService,
    private readonly carts: CartService,
    private readonly store: StoreService,
    private readonly tenants: TenantRepository,
  ) {}

  /**
   * Link que o atendente manda. Reaproveita o link ainda válido da conversa (o
   * cliente que pede de novo recebe o MESMO endereço, e o carrinho segue lá).
   * `null` = sem `PUBLIC_APP_URL` (o agente segue pelo chat).
   */
  async createMenuLink(
    tenantId: TenantId,
    conversationId: number,
  ): Promise<string | null> {
    if (env.publicAppUrl === "") return null;

    let code =
      (await this.links.findActiveMenuLink(tenantId, conversationId))?.code ??
      null;
    if (code === null) {
      const expiresAt = new Date(Date.now() + MENU_LINK_TTL_MS);
      for (
        let attempt = 0;
        attempt < MAX_CODE_ATTEMPTS && code === null;
        attempt += 1
      ) {
        const candidate = generateMenuLinkCode();
        if (
          await this.links.insertMenuLink(
            tenantId,
            conversationId,
            candidate,
            expiresAt,
          )
        ) {
          code = candidate;
        }
      }
      if (code === null)
        throw new Error("Não foi possível criar o link do cardápio");
      // Limpeza oportunista: sem job, o lixo sai quando alguém cria link.
      await this.links.deleteStaleMenuLinks(tenantId).catch(() => undefined);
    }

    await this.links.insertMenuLinkEvent(tenantId, conversationId, "sent");
    return `${env.publicAppUrl}/c/${code}`;
  }

  /**
   * Código → conversa. Lixo, código desconhecido e link vencido são 401 com
   * códigos distintos. A conversa PRECISA existir no tenant do link: simulador
   * reiniciado (conversa apagada) invalida o link, em vez de gravar carrinho num
   * id que sumiu.
   */
  private async resolveSession(code: string): Promise<Session> {
    if (!isWellFormedCode(code))
      throw new UnauthorizedError("invalid_menu_link");

    const link = await this.links.findMenuLinkByCode(code);
    if (!link) throw new UnauthorizedError("invalid_menu_link");
    if (link.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("expired_menu_link");
    }

    const tenantId = asTenantId(link.tenantId);
    const target = await this.conversations.findConversationTarget(
      tenantId,
      link.conversationId,
    );
    if (!target) throw new UnauthorizedError("invalid_menu_link");
    return {
      tenantId,
      conversationId: link.conversationId,
      channel: target.channel,
    };
  }

  async getPublicMenuView(code: string): Promise<PublicMenuView> {
    const session = await this.resolveSession(code);
    const { tenantId, conversationId } = session;

    const [settings, menu, cart, tenant] = await Promise.all([
      this.store.getStoreSettings(tenantId),
      this.menu.getPublishedMenu(tenantId),
      this.carts.getCart(tenantId, conversationId),
      this.tenants.findTenantById(tenantId),
    ]);
    const now = new Date();
    const open = isOpenAt(settings, now);
    const next = open || settings.paused ? null : nextOpening(settings, now);

    await this.links.insertMenuLinkEvent(tenantId, conversationId, "opened");

    return {
      restaurant: {
        name: settings.restaurantName ?? tenant?.name ?? "",
        logoUrl: settings.logoUrl,
        open,
        paused: settings.paused,
        nextOpening: next ? next.toISOString() : null,
        timezone: settings.timezone,
        minOrderCents: settings.minOrderCents,
      },
      menu: toPublicMenu(menu),
      cart: { items: cart.items },
      whatsappUrl:
        session.channel === "whatsapp"
          ? whatsAppReturnUrl(settings.whatsappNumber, RETURN_TEXT)
          : null,
    };
  }

  /**
   * A página confirma os itens. Valida TODAS as linhas com `priceCart` (o
   * navegador não é fonte de preço), grava no carrinho da conversa e avisa no
   * chat. Entrega, pagamento e endereço NÃO são exigidos aqui: continuam na
   * conversa. Falha do aviso não desfaz o carrinho já gravado.
   */
  async confirmPublicCart(
    code: string,
    body: unknown,
  ): Promise<ConfirmedCartView> {
    const session = await this.resolveSession(code);
    const { tenantId, conversationId } = session;

    const parsed = parseCartItems(body);
    if (!parsed.ok) {
      throw new InvalidPublicCartError(
        parsed.error === "cart_empty" ? "cart_empty" : "cart_invalid",
      );
    }

    const [menu, settings, zones, current] = await Promise.all([
      this.menu.getPublishedMenu(tenantId),
      this.store.getStoreSettings(tenantId),
      this.store.listZones(tenantId),
      this.carts.getCart(tenantId, conversationId),
    ]);

    const candidate = { ...current, items: parsed.value };
    const zone = zones.find((z) => z.id === candidate.zoneId) ?? null;
    const priced = priceCart(candidate, menu, zone, settings);

    const blocking = blockingProblems(priced.problems);
    if (blocking.length > 0) {
      throw new InvalidPublicCartError(
        "cart_invalid",
        blocking.map((p) => ({ code: p.code, lineIndex: p.lineIndex })),
      );
    }

    const saved = await this.carts.saveEditedCart(
      tenantId,
      conversationId,
      candidate,
    );
    await this.links.insertMenuLinkEvent(tenantId, conversationId, "confirmed");

    let notified = true;
    try {
      await this.outbound.sendOutbound(
        tenantId,
        conversationId,
        formatCartReceived(priced, saved),
      );
    } catch (err) {
      notified = false;
      this.logger.error(
        `Falha ao avisar o chat do carrinho do cardápio: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      lines: priced.lines.map((l) => ({
        name: l.name,
        sizeName: l.sizeName,
        quantity: l.quantity,
        totalCents: l.lineTotalCents,
      })),
      subtotalCents: priced.subtotalCents,
      notified,
      whatsappUrl:
        session.channel === "whatsapp"
          ? whatsAppReturnUrl(settings.whatsappNumber, RETURN_TEXT)
          : null,
    };
  }
}
