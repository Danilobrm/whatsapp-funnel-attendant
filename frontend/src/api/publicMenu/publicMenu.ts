import { request } from '../client/client.ts';

/** Cardápio como a página o enxerga — espelha `PublicCategory` do backend. */
export interface PublicOption {
  id: number;
  name: string;
  priceCents: number;
  available: boolean;
}

export type PricingRule = 'sum' | 'max' | 'average';

export interface PublicGroup {
  id: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  pricingRule: PricingRule;
  options: PublicOption[];
}

export interface PublicSize {
  id: number;
  name: string;
  priceCents: number;
}

export interface PublicItem {
  id: number;
  name: string;
  description: string | null;
  /** `null` quando o preço vem do tamanho. */
  priceCents: number | null;
  imageUrl: string | null;
  available: boolean;
  sizes: PublicSize[];
  optionGroups: PublicGroup[];
}

export interface PublicCategory {
  id: number;
  name: string;
  items: PublicItem[];
}

/** Uma linha do carrinho — só ids e quantidade; o preço é sempre recalculado. */
export interface CartLine {
  itemId: number;
  sizeId: number | null;
  optionIds: number[];
  quantity: number;
  notes: string | null;
}

export interface PublicMenuView {
  restaurant: {
    name: string;
    logoUrl: string | null;
    open: boolean;
    paused: boolean;
    /** ISO; só quando fechada. */
    nextOpening: string | null;
    timezone: string;
    minOrderCents: number;
  };
  menu: PublicCategory[];
  cart: { items: CartLine[] };
  whatsappUrl: string | null;
}

export interface ConfirmedCart {
  lines: {
    name: string;
    sizeName: string | null;
    quantity: number;
    totalCents: number;
  }[];
  subtotalCents: number;
  notified: boolean;
  whatsappUrl: string | null;
}

export interface CartProblem {
  code: string;
  lineIndex: number | null;
}

/**
 * Falha de uma chamada pública. A página traduz por `code`
 * (`publicMenu.errors.<code>`) — o `message` nunca vai para a tela.
 * `problems` só existe no 422 de carrinho recusado.
 */
export class PublicMenuError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problems: CartProblem[];

  constructor(status: number, code: string, problems: CartProblem[] = []) {
    super(`public_menu:${status}:${code}`);
    this.name = 'PublicMenuError';
    this.status = status;
    this.code = code;
    this.problems = problems;
  }
}

function mapper(status: number) {
  return (payload: unknown): Error => {
    const body = (payload ?? {}) as { code?: unknown; problems?: unknown };
    return new PublicMenuError(
      status,
      typeof body.code === 'string' ? body.code : 'unknown',
      Array.isArray(body.problems) ? (body.problems as CartProblem[]) : [],
    );
  };
}

/**
 * Sem `auth`: quem abre o link é o cliente final, sem login. Os status
 * mapeados aqui também tiram a chamada do logout global — um link vencido
 * NÃO pode deslogar o admin que por acaso está no mesmo navegador.
 */
const ON_STATUS = { 401: mapper(401), 422: mapper(422), 429: mapper(429) };

export function fetchPublicMenu(token: string): Promise<PublicMenuView> {
  return request<PublicMenuView>(
    `/api/public/menu/${encodeURIComponent(token)}`,
    { auth: false, onStatus: ON_STATUS },
  );
}

export async function confirmPublicCart(
  token: string,
  items: CartLine[],
): Promise<ConfirmedCart> {
  const data = await request<{ cart: ConfirmedCart }>(
    `/api/public/cart/${encodeURIComponent(token)}`,
    { method: 'POST', body: { items }, auth: false, onStatus: ON_STATUS },
  );
  return data.cart;
}
