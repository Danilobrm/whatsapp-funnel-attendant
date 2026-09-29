import type {
  CartLine,
  PricingRule,
  PublicCategory,
  PublicItem,
} from '../api/publicMenu/publicMenu.ts';

/**
 * Preço do carrinho na página do cardápio — só para MOSTRAR o total ao vivo.
 * Espelha `priceCart` do backend (`order/pricing.ts`): o servidor recalcula
 * tudo ao confirmar e é ele quem manda no valor da mensagem ao cliente, então
 * uma divergência aqui é cosmética, nunca cobrança. Dinheiro em centavos
 * inteiros o tempo todo.
 */

export const MAX_LINE_QUANTITY = 50;

/** Acréscimo de UM grupo de opções (mesma regra e mesmo arredondamento do backend). */
export function groupExtraCents(
  rule: PricingRule,
  prices: readonly number[],
): number {
  if (prices.length === 0) return 0;
  const sum = prices.reduce((a, b) => a + b, 0);
  if (rule === 'max') return Math.max(...prices);
  if (rule === 'average') return Math.round(sum / prices.length);
  return sum;
}

export interface Selection {
  sizeId: number | null;
  optionIds: number[];
}

export type SelectionIssue =
  | { kind: 'size_required' }
  | { kind: 'group_min'; groupId: number; missing: number }
  | { kind: 'group_max'; groupId: number };

/** O que falta (ou sobra) para a escolha valer. Vazio = pode adicionar. */
export function selectionIssues(
  item: PublicItem,
  selection: Selection,
): SelectionIssue[] {
  const issues: SelectionIssue[] = [];
  if (item.sizes.length > 0 && selection.sizeId === null) {
    issues.push({ kind: 'size_required' });
  }
  for (const group of item.optionGroups) {
    const chosen = group.options.filter((o) =>
      selection.optionIds.includes(o.id),
    ).length;
    if (chosen < group.minSelect) {
      issues.push({
        kind: 'group_min',
        groupId: group.id,
        missing: group.minSelect - chosen,
      });
    }
    if (chosen > group.maxSelect) {
      issues.push({ kind: 'group_max', groupId: group.id });
    }
  }
  return issues;
}

/**
 * Preço de UMA unidade. `null` enquanto não dá para calcular (tamanho ainda
 * não escolhido, ou item sem preço) — a tela mostra "a partir de".
 */
export function unitPriceCents(
  item: PublicItem,
  selection: Selection,
): number | null {
  let base: number;
  if (item.sizes.length > 0) {
    const size = item.sizes.find((s) => s.id === selection.sizeId);
    if (!size) return null;
    base = size.priceCents;
  } else if (item.priceCents !== null) {
    base = item.priceCents;
  } else {
    return null;
  }

  let extras = 0;
  for (const group of item.optionGroups) {
    const chosen = group.options.filter((o) =>
      selection.optionIds.includes(o.id),
    );
    extras += groupExtraCents(
      group.pricingRule,
      chosen.map((o) => o.priceCents),
    );
  }
  return base + extras;
}

/** Menor preço possível do item ("a partir de"). `null` sem preço algum. */
export function startingPriceCents(item: PublicItem): number | null {
  if (item.sizes.length > 0) {
    return Math.min(...item.sizes.map((s) => s.priceCents));
  }
  return item.priceCents;
}

export function findItem(
  menu: readonly PublicCategory[],
  itemId: number,
): PublicItem | null {
  for (const category of menu) {
    const item = category.items.find((i) => i.id === itemId);
    if (item) return item;
  }
  return null;
}

export interface DisplayLine {
  index: number;
  line: CartLine;
  item: PublicItem;
  sizeName: string | null;
  /** Nomes das opções, na ordem dos grupos do item. */
  optionNames: string[];
  unitCents: number;
  totalCents: number;
}

export interface DisplayCart {
  lines: DisplayLine[];
  subtotalCents: number;
  /** Linhas cujo item saiu do cardápio ou esgotou desde que foram adicionadas. */
  unavailable: number[];
  itemCount: number;
}

/** Linhas do carrinho prontas para exibir, com total. */
export function displayCart(
  menu: readonly PublicCategory[],
  lines: readonly CartLine[],
): DisplayCart {
  const out: DisplayLine[] = [];
  const unavailable: number[] = [];

  lines.forEach((line, index) => {
    const item = findItem(menu, line.itemId);
    if (!item || !item.available) {
      unavailable.push(index);
      return;
    }
    const unit = unitPriceCents(item, line);
    if (unit === null) {
      unavailable.push(index);
      return;
    }
    out.push({
      index,
      line,
      item,
      sizeName: item.sizes.find((s) => s.id === line.sizeId)?.name ?? null,
      optionNames: item.optionGroups.flatMap((g) =>
        g.options
          .filter((o) => line.optionIds.includes(o.id))
          .map((o) => o.name),
      ),
      unitCents: unit,
      totalCents: unit * line.quantity,
    });
  });

  return {
    lines: out,
    subtotalCents: out.reduce((sum, l) => sum + l.totalCents, 0),
    unavailable,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

/** Duas linhas são "a mesma" (somam quantidade) se item, tamanho, opções e nota coincidem. */
export function sameLine(a: CartLine, b: CartLine): boolean {
  return (
    a.itemId === b.itemId &&
    a.sizeId === b.sizeId &&
    a.notes === b.notes &&
    a.optionIds.length === b.optionIds.length &&
    [...a.optionIds].sort((x, y) => x - y).join() ===
      [...b.optionIds].sort((x, y) => x - y).join()
  );
}
