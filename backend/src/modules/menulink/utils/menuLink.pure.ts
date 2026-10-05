import { formatBRL } from "../../../lib/money.js";

import { MAX_LINE_QUANTITY } from "../../order/utils/pricing.js";

import type { Parsed } from "../../agent/tools/args.js";
import type { Menu } from "../../menu/types/menu.types.js";
import type { Cart, CartLine } from "../../order/types/cart.types.js";
import type { PricedCart, PricingProblem } from "../../order/utils/pricing.js";

/**
 * Parte PURA do cardápio em link: o que a página pode ver do cardápio, o que
 * pode mandar de volta e os textos que o SISTEMA (não o modelo) escreve.
 */

// ---------------------------------------------------------- cardápio público

export interface PublicOption {
  id: number;
  name: string;
  priceCents: number;
  available: boolean;
}
export interface PublicGroup {
  id: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  pricingRule: "sum" | "max" | "average";
  options: PublicOption[];
}
export interface PublicItem {
  id: number;
  name: string;
  description: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  available: boolean;
  sizes: { id: number; name: string; priceCents: number }[];
  optionGroups: PublicGroup[];
}
export interface PublicCategory {
  id: number;
  name: string;
  items: PublicItem[];
}

/**
 * Cardápio para a página: só categorias e itens ATIVOS (esgotado aparece,
 * marcado, para o cliente ver que existe), sem `position`, `active` nem
 * `categoryId`. Campo novo no modelo interno NÃO vaza por aqui sem querer:
 * a forma pública é montada campo a campo.
 */
export function toPublicMenu(menu: Menu): PublicCategory[] {
  return menu
    .filter((c) => c.active)
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items
        .filter((i) => i.active)
        .map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          priceCents: i.sizes.length > 0 ? null : i.priceCents,
          imageUrl: i.imageUrl,
          available: i.available,
          sizes: i.sizes.map((s) => ({
            id: s.id,
            name: s.name,
            priceCents: s.priceCents,
          })),
          optionGroups: i.optionGroups.map((g) => ({
            id: g.id,
            name: g.name,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            pricingRule: g.pricingRule,
            options: g.options.map((o) => ({
              id: o.id,
              name: o.name,
              priceCents: o.priceCents,
              available: o.available,
            })),
          })),
        })),
    }))
    .filter((c) => c.items.length > 0);
}

// ------------------------------------------------------- carrinho recebido

/** Linhas máximas de um carrinho vindo da página (barra payload absurdo). */
export const MAX_PUBLIC_CART_LINES = 50;

const toInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v > 0 && v < 1_000_000_000
    ? v
    : null;

/**
 * Valida o corpo de `POST /api/public/cart/:token` (vem cru do navegador).
 * Só FORMA: existência, tamanho, opções e preço quem confere é o `priceCart`.
 * Aqui não se aceita string numérica — o navegador é código nosso.
 */
export function parseCartItems(raw: unknown): Parsed<CartLine[]> {
  const items = (raw as { items?: unknown } | null | undefined)?.items;
  if (!Array.isArray(items)) return { ok: false, error: "items_required" };
  if (items.length === 0) return { ok: false, error: "cart_empty" };
  if (items.length > MAX_PUBLIC_CART_LINES) {
    return { ok: false, error: "too_many_lines" };
  }

  const lines: CartLine[] = [];
  for (const entry of items) {
    const r = (entry ?? {}) as Record<string, unknown>;
    const itemId = toInt(r.itemId);
    if (itemId === null) return { ok: false, error: "invalid_line" };

    let sizeId: number | null = null;
    if (r.sizeId !== undefined && r.sizeId !== null) {
      sizeId = toInt(r.sizeId);
      if (sizeId === null) return { ok: false, error: "invalid_line" };
    }

    let optionIds: number[] = [];
    if (r.optionIds !== undefined && r.optionIds !== null) {
      if (!Array.isArray(r.optionIds) || r.optionIds.length > 60) {
        return { ok: false, error: "invalid_line" };
      }
      const ids = r.optionIds.map(toInt);
      if (ids.some((id) => id === null))
        return { ok: false, error: "invalid_line" };
      optionIds = [...new Set(ids as number[])];
    }

    const quantity = toInt(r.quantity);
    if (quantity === null || quantity > MAX_LINE_QUANTITY) {
      return { ok: false, error: "invalid_line" };
    }

    const notes =
      typeof r.notes === "string" && r.notes.trim().length > 0
        ? r.notes.trim().slice(0, 200)
        : null;

    lines.push({ itemId, sizeId, optionIds, quantity, notes });
  }
  return { ok: true, value: lines };
}

/**
 * Problemas que impedem GRAVAR o carrinho: os de LINHA (item, tamanho,
 * opção, quantidade). Entrega, pagamento, mínimo etc. ainda serão definidos
 * na conversa — não são erro da página.
 */
export function blockingProblems(problems: PricingProblem[]): PricingProblem[] {
  return problems.filter((p) => p.lineIndex !== null);
}

// ------------------------------------------------------------------ textos

/** Texto do SISTEMA que leva o link. Termina o turno do agente (não é parafraseado). */
export function formatMenuLinkMessage(url: string): string {
  return [
    "Aqui está o nosso cardápio com fotos, tamanhos e adicionais:",
    url,
    "",
    "Monte seu pedido por lá e, quando terminar, é só voltar aqui que eu continuo com a entrega e o pagamento.",
  ].join("\n");
}

/** Próxima pergunta, conforme o que já se sabe do carrinho. */
function nextQuestion(cart: Cart): string {
  if (cart.fulfillment === null) return "É para entrega ou retirada?";
  if (cart.fulfillment === "delivery" && cart.address === null) {
    return "Qual o endereço de entrega (rua, número e bairro)?";
  }
  if (cart.paymentMethod === null) return "Qual a forma de pagamento?";
  return "Está tudo certo? Me diga e eu mando o resumo para você confirmar.";
}

/** Mensagem que o backend posta no chat quando a página confirma os itens. */
export function formatCartReceived(priced: PricedCart, cart: Cart): string {
  const lines = priced.lines.map((l) => {
    const name = l.sizeName ? `${l.name} ${l.sizeName}` : l.name;
    const out = [`${l.quantity}x ${name} — ${formatBRL(l.lineTotalCents)}`];
    const groups = new Map<string, string[]>();
    for (const o of l.options) {
      groups.set(o.group, [...(groups.get(o.group) ?? []), o.name]);
    }
    const opts = [...groups.entries()]
      .map(([g, names]) => `${g}: ${names.join(" + ")}`)
      .join(" · ");
    if (opts) out.push(`   ${opts}`);
    if (l.notes) out.push(`   Obs: ${l.notes}`);
    return out.join("\n");
  });
  return [
    "Recebi seu carrinho pelo cardápio!",
    "",
    ...lines,
    "",
    `Subtotal: ${formatBRL(priced.subtotalCents)}`,
    "",
    nextQuestion(cart),
  ].join("\n");
}

/** `https://wa.me/<número>?text=...`. `null` sem número válido. */
export function whatsAppReturnUrl(
  number: string | null,
  text: string,
): string | null {
  if (!number) return null;
  const digits = number.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Texto pré-preenchido do "Voltar ao WhatsApp" — dá ao agente uma mensagem para reagir. */
export const RETURN_TEXT = "Montei meu pedido pelo cardápio";
