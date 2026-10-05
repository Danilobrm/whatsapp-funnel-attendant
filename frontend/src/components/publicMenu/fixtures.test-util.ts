import type { PublicCategory, PublicMenuView } from '../../api/publicMenu/publicMenu.ts';

/** Cardápio de teste: pizza meio a meio com tamanhos + borda, lanche com adicionais, bebidas. */
export const MENU: PublicCategory[] = [
  {
    id: 1,
    name: 'Pizzas',
    items: [
      {
        id: 10,
        name: 'Pizza',
        description: 'Pizza tradicional',
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
              {
                id: 2003,
                name: 'Quatro Queijos',
                priceCents: 500,
                available: true,
              },
              {
                id: 2004,
                name: 'Sabor Esgotado',
                priceCents: 0,
                available: false,
              },
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
      },
    ],
  },
  {
    id: 2,
    name: 'Lanches',
    items: [
      {
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
      },
    ],
  },
  {
    id: 3,
    name: 'Bebidas',
    items: [
      {
        id: 30,
        name: 'Coca 2L',
        description: null,
        priceCents: 1200,
        imageUrl: null,
        available: true,
        sizes: [],
        optionGroups: [],
      },
      {
        id: 31,
        name: 'Suco de Laranja',
        description: null,
        priceCents: 900,
        imageUrl: null,
        available: false,
        sizes: [],
        optionGroups: [],
      },
    ],
  },
];

export function view(over: Partial<PublicMenuView> = {}): PublicMenuView {
  return {
    restaurant: {
      name: 'Pizzaria do Zé',
      logoUrl: null,
      open: true,
      paused: false,
      nextOpening: null,
      timezone: 'America/Sao_Paulo',
      minOrderCents: 0,
    },
    menu: MENU,
    cart: { items: [] },
    whatsappUrl: 'https://wa.me/5561999990000?text=Montei',
    ...over,
  };
}
