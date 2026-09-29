import { env } from "../../../config/env.js";
import { UnauthorizedError } from "../../auth/errors/auth.errors.js";
import { findConversationTarget } from "../../conversation/repositories/conversation.repository.js";
import { sendOutbound } from "../../conversation/services/conversation.service.js";
import { getPublishedMenu } from "../../menu/services/menu.service.js";
import { getCart } from "../../order/services/cart.service.js";
import { saveEditedCart } from "../../order/services/cart.service.js";
import { priceCart } from "../../order/utils/pricing.js";
import { isOpenAt, nextOpening } from "../../store/utils/store.hours.js";
import {
  getStoreSettings,
  listZones,
} from "../../store/services/store.service.js";
import { findTenantById } from "../../tenants/repositories/tenant.repository.js";
import { asTenantId } from "../../tenants/types/tenant.types.js";
import { InvalidPublicCartError } from "../errors/menuLink.errors.js";
import {
  blockingProblems,
  formatCartReceived,
  parseCartItems,
  RETURN_TEXT,
  toPublicMenu,
  whatsAppReturnUrl,
} from "../utils/menuLink.pure.js";
import {
  generateMenuLinkCode,
  isWellFormedCode,
  MENU_LINK_TTL_MS,
} from "../utils/menuLink.code.js";
import {
  deleteStaleMenuLinks,
  findActiveMenuLink,
  findMenuLinkByCode,
  insertMenuLink,
  insertMenuLinkEvent,
} from "../repositories/menuLink.repository.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { CartLine } from "../../order/types/cart.types.js";
import type { PublicCategory } from "../utils/menuLink.pure.js";

/** Tentativas de achar um código livre (colisão de 72 bits: na prática nunca passa da 1ª). */
const MAX_CODE_ATTEMPTS = 5;

/**
 * Link que o atendente manda. Reaproveita o link ainda válido da conversa (o
 * cliente que pede de novo recebe o MESMO endereço, e o carrinho segue lá).
 * `null` = sem `PUBLIC_APP_URL` (o agente segue pelo chat).
 */
export async function createMenuLink(
  tenantId: TenantId,
  conversationId: number,
): Promise<string | null> {
  if (env.publicAppUrl === "") return null;

  let code = (await findActiveMenuLink(tenantId, conversationId))?.code ?? null;
  if (code === null) {
    const expiresAt = new Date(Date.now() + MENU_LINK_TTL_MS);
    for (
      let attempt = 0;
      attempt < MAX_CODE_ATTEMPTS && code === null;
      attempt += 1
    ) {
      const candidate = generateMenuLinkCode();
      if (
        await insertMenuLink(tenantId, conversationId, candidate, expiresAt)
      ) {
        code = candidate;
      }
    }
    if (code === null)
      throw new Error("Não foi possível criar o link do cardápio");
    // Limpeza oportunista: sem job, o lixo sai quando alguém cria link.
    await deleteStaleMenuLinks(tenantId).catch(() => undefined);
  }

  await insertMenuLinkEvent(tenantId, conversationId, "sent");
  return `${env.publicAppUrl}/c/${code}`;
}

interface Session {
  tenantId: TenantId;
  conversationId: number;
  channel: "whatsapp" | "simulator";
}

/**
 * Código → conversa. Lixo, código desconhecido e link vencido são 401 com
 * códigos distintos. A conversa PRECISA existir no tenant do link: simulador
 * reiniciado (conversa apagada) invalida o link, em vez de gravar carrinho num
 * id que sumiu.
 */
async function resolveSession(code: string): Promise<Session> {
  if (!isWellFormedCode(code)) throw new UnauthorizedError("invalid_menu_link");

  const link = await findMenuLinkByCode(code);
  if (!link) throw new UnauthorizedError("invalid_menu_link");
  if (link.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError("expired_menu_link");
  }

  const tenantId = asTenantId(link.tenantId);
  const target = await findConversationTarget(tenantId, link.conversationId);
  if (!target) throw new UnauthorizedError("invalid_menu_link");
  return {
    tenantId,
    conversationId: link.conversationId,
    channel: target.channel,
  };
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

export async function getPublicMenuView(code: string): Promise<PublicMenuView> {
  const session = await resolveSession(code);
  const { tenantId, conversationId } = session;

  const [settings, menu, cart, tenant] = await Promise.all([
    getStoreSettings(tenantId),
    getPublishedMenu(tenantId),
    getCart(tenantId, conversationId),
    findTenantById(tenantId),
  ]);
  const now = new Date();
  const open = isOpenAt(settings, now);
  const next = open || settings.paused ? null : nextOpening(settings, now);

  await insertMenuLinkEvent(tenantId, conversationId, "opened");

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

/**
 * A página confirma os itens. Valida TODAS as linhas com `priceCart` (o
 * navegador não é fonte de preço), grava no carrinho da conversa e avisa no
 * chat. Entrega, pagamento e endereço NÃO são exigidos aqui: continuam na
 * conversa. Falha do aviso não desfaz o carrinho já gravado.
 */
export async function confirmPublicCart(
  code: string,
  body: unknown,
): Promise<ConfirmedCartView> {
  const session = await resolveSession(code);
  const { tenantId, conversationId } = session;

  const parsed = parseCartItems(body);
  if (!parsed.ok) {
    throw new InvalidPublicCartError(
      parsed.error === "cart_empty" ? "cart_empty" : "cart_invalid",
    );
  }

  const [menu, settings, zones, current] = await Promise.all([
    getPublishedMenu(tenantId),
    getStoreSettings(tenantId),
    listZones(tenantId),
    getCart(tenantId, conversationId),
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

  const saved = await saveEditedCart(tenantId, conversationId, candidate);
  await insertMenuLinkEvent(tenantId, conversationId, "confirmed");

  let notified = true;
  try {
    await sendOutbound(
      tenantId,
      conversationId,
      formatCartReceived(priced, saved),
    );
  } catch (err) {
    notified = false;
    console.error(
      "Falha ao avisar o chat do carrinho do cardápio:",
      err instanceof Error ? err.message : String(err),
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
