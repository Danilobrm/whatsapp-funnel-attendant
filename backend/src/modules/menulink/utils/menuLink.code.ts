import { randomBytes } from "node:crypto";

/**
 * Código do link do cardápio (`/c/<código>`). Curto de propósito: o link vai
 * num chat. É só um ponteiro ALEATÓRIO para uma linha de `menu_links` — o
 * tenant, a conversa e a validade moram no banco, não na URL. Segurança =
 * imprevisibilidade (72 bits) + validade + rate limit na rota pública.
 */

/** Igual ao TTL do carrinho: link vencido = carrinho que já seria descartado. */
export const MENU_LINK_TTL_MS = 3 * 60 * 60 * 1000;

/** 9 bytes → 12 caracteres base64url (72 bits: inviável de adivinhar). */
export function generateMenuLinkCode(): string {
  return randomBytes(9).toString("base64url");
}

const CODE_RE = /^[A-Za-z0-9_-]{8,32}$/;

/** Barra lixo antes de gastar uma consulta ao banco. */
export function isWellFormedCode(code: string): boolean {
  return CODE_RE.test(code);
}
