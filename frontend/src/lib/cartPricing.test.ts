import { describe, expect, it } from 'vitest';

import type { PublicCategory, PublicItem } from '../api/publicMenu/publicMenu.ts';
import {
  displayCart,
  findItem,
  groupExtraCents,
  sameLine,
  selectionIssues,
  startingPriceCents,
  unitPriceCents,
} from './cartPricing.ts';

const PIZZA: PublicItem = {
  id: 10,
  name: 'Pizza',
  description: null,
  priceCents: null,
  imageUrl: null,
  available: true,
  sizes: [
    { id: 101, name: 'Média', priceCents: 4500 },
    { id: 102, name: 'Grande', priceCents: 5800 },
  ],
  optionGroups: [
    {
      id: 1001,
      name: 'Sabores',
      minSelect: 2,
      maxSelect: 2,
      pricingRule: 'average',
      options: [
        { id: 2001, name: 'Calabresa', priceCents: 0, available: true },
        { id: 2002, name: 'Marguerita', priceCents: 0, available: true },
        { id: 2003, name: 'Quatro Queijos', priceCents: 500, available: true },
      ],
    },
    {
      id: 1002,
      name: 'Borda',
      minSelect: 0,
      maxSelect: 1,
      pricingRule: 'sum',
      options: [
        { id: 2101, name: 'Sem borda', priceCents: 0, available: true },
        { id: 2102, name: 'Catupiry', priceCents: 800, available: true },
      ],
    },
  ],
};

const BURGER: PublicItem = {
  id: 20,
  name: 'X-Burger',
  description: null,
  priceCents: 1800,
  imageUrl: null,
  available: true,
  sizes: [],
  optionGroups: [
    {
      id: 1003,
      name: 'Adicionais',
      minSelect: 0,
      maxSelect: 3,
      pricingRule: 'sum',
      options: [
        { id: 2201, name: 'Bacon', priceCents: 400, available: true },
        { id: 2202, name: 'Ovo', priceCents: 300, available: true },
      ],
    },
  ],
};

const SOLD_OUT: PublicItem = {
  ...BURGER,
  id: 21,
  name: 'Esgotado',
  available: false,
};

const MENU: PublicCategory[] = [
  { id: 1, name: 'Pizzas', items: [PIZZA] },
  { id: 2, name: 'Lanches', items: [BURGER, SOLD_OUT] },
];

// Mesma tabela do backend (`pricing.test.ts`): se uma mudar, a outra tem de mudar.
describe('groupExtraCents (mirrors backend pricing)', () => {
  it.each([
    ['sum', [400, 300], 700],
    ['max', [400, 300], 400],
    ['average', [0, 500], 250],
    ['average', [0, 0], 0],
    ['average', [100, 201], 151],
    ['sum', [], 0],
    ['average', [], 0],
  ] as const)('%s of %j = %i', (rule, prices, expected) => {
    expect(groupExtraCents(rule, prices)).toBe(expected);
  });
});

describe('unitPriceCents', () => {
  it('size + half-and-half average + border (the same 68,50 as the backend)', () => {
    expect(
      unitPriceCents(PIZZA, { sizeId: 102, optionIds: [2001, 2003, 2102] }),
    ).toBe(6850);
  });

  it('is null until a size is chosen', () => {
    expect(unitPriceCents(PIZZA, { sizeId: null, optionIds: [] })).toBeNull();
    expect(unitPriceCents(PIZZA, { sizeId: 999, optionIds: [] })).toBeNull();
  });

  it('adds add-ons to an item without sizes', () => {
    expect(
      unitPriceCents(BURGER, { sizeId: null, optionIds: [2201, 2202] }),
    ).toBe(2500);
  });

  it('is null for an item with neither price nor sizes', () => {
    expect(
      unitPriceCents(
        { ...BURGER, priceCents: null },
        { sizeId: null, optionIds: [] },
      ),
    ).toBeNull();
  });

  it('ignores option ids that do not belong to the item', () => {
    expect(unitPriceCents(BURGER, { sizeId: null, optionIds: [2001] })).toBe(
      1800,
    );
  });
});

describe('startingPriceCents', () => {
  it('is the cheapest size, or the single price, or null', () => {
    expect(startingPriceCents(PIZZA)).toBe(4500);
    expect(startingPriceCents(BURGER)).toBe(1800);
    expect(startingPriceCents({ ...BURGER, priceCents: null })).toBeNull();
  });
});

describe('selectionIssues', () => {
  it('asks for a size and both flavors of a fresh pizza', () => {
    expect(selectionIssues(PIZZA, { sizeId: null, optionIds: [] })).toEqual([
      { kind: 'size_required' },
      { kind: 'group_min', groupId: 1001, missing: 2 },
    ]);
  });

  it('counts how many flavors are still missing', () => {
    expect(selectionIssues(PIZZA, { sizeId: 101, optionIds: [2001] })).toEqual([
      { kind: 'group_min', groupId: 1001, missing: 1 },
    ]);
  });

  it('is valid with a size and two flavors (border is optional)', () => {
    expect(
      selectionIssues(PIZZA, { sizeId: 101, optionIds: [2001, 2002] }),
    ).toEqual([]);
  });

  it('flags too many choices in a group', () => {
    expect(
      selectionIssues(PIZZA, { sizeId: 101, optionIds: [2001, 2002, 2003] }),
    ).toEqual([{ kind: 'group_max', groupId: 1001 }]);
  });

  it('an item with no required choices is always valid', () => {
    expect(selectionIssues(BURGER, { sizeId: null, optionIds: [] })).toEqual(
      [],
    );
  });
});

describe('displayCart', () => {
  it('prices lines, names size and options, and totals with quantity', () => {
    const cart = displayCart(MENU, [
      {
        itemId: 10,
        sizeId: 102,
        optionIds: [2001, 2003, 2102],
        quantity: 2,
        notes: null,
      },
      {
        itemId: 20,
        sizeId: null,
        optionIds: [2201],
        quantity: 1,
        notes: 'sem cebola',
      },
    ]);

    expect(cart.lines).toHaveLength(2);
    expect(cart.lines[0]).toMatchObject({
      index: 0,
      sizeName: 'Grande',
      optionNames: ['Calabresa', 'Quatro Queijos', 'Catupiry'],
      unitCents: 6850,
      totalCents: 13700,
    });
    expect(cart.lines[1]).toMatchObject({
      sizeName: null,
      optionNames: ['Bacon'],
      totalCents: 2200,
    });
    expect(cart.subtotalCents).toBe(15900);
    expect(cart.itemCount).toBe(3);
    expect(cart.unavailable).toEqual([]);
  });

  // Item que esgotou/saiu do cardápio depois de adicionado não entra no total.
  it('flags lines whose item sold out or left the menu, and leaves them out of the total', () => {
    const cart = displayCart(MENU, [
      { itemId: 20, sizeId: null, optionIds: [], quantity: 1, notes: null },
      { itemId: 21, sizeId: null, optionIds: [], quantity: 1, notes: null },
      { itemId: 999, sizeId: null, optionIds: [], quantity: 1, notes: null },
    ]);

    expect(cart.unavailable).toEqual([1, 2]);
    expect(cart.subtotalCents).toBe(1800);
    expect(cart.lines.map((l) => l.index)).toEqual([0]);
  });

  it('is empty for an empty cart', () => {
    expect(displayCart(MENU, [])).toEqual({
      lines: [],
      subtotalCents: 0,
      unavailable: [],
      itemCount: 0,
    });
  });
});

describe('findItem / sameLine', () => {
  it('finds an item across categories', () => {
    expect(findItem(MENU, 20)?.name).toBe('X-Burger');
    expect(findItem(MENU, 404)).toBeNull();
  });

  it('merges lines that only differ in the order of the options', () => {
    const a = {
      itemId: 10,
      sizeId: 102,
      optionIds: [2001, 2003],
      quantity: 1,
      notes: null,
    };

    expect(sameLine(a, { ...a, optionIds: [2003, 2001], quantity: 5 })).toBe(
      true,
    );
  });

  it.each([
    ['size', { sizeId: 101 }],
    ['options', { optionIds: [2001, 2002] }],
    ['notes', { notes: 'bem assada' }],
    ['item', { itemId: 20 }],
  ])('does not merge lines with a different %s', (_n, over) => {
    const a = {
      itemId: 10,
      sizeId: 102,
      optionIds: [2001, 2003],
      quantity: 1,
      notes: null,
    };

    expect(sameLine(a, { ...a, ...over })).toBe(false);
  });
});
