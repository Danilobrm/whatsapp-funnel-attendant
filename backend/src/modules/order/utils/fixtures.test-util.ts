import type { Menu } from "../../menu/types/menu.types.js";
import type { DeliveryZone } from "../../store/types/store.types.js";
import type { PricingSettings } from "./pricing.js";
import { emptyCart } from "../types/cart.types.js";
import type { Cart } from "../types/cart.types.js";

/**
 * Cardápio/loja de teste compartilhado pelos testes do pedido e do agente.
 * Espelha o seed: pizza com tamanhos + sabores meio a meio (`average`) + borda,
 * lanche com adicionais e bebida simples.
 */
export const MENU: Menu = [
  {
    id: 1,
    name: "Pizzas",
    position: 0,
    active: true,
    items: [
      {
        id: 10,
        categoryId: 1,
        name: "Pizza",
        description: "Pizza tradicional",
        priceCents: null,
        imageUrl: null,
        available: true,
        active: true,
        position: 0,
        sizes: [
          { id: 101, name: "Média", priceCents: 4500, position: 0 },
          { id: 102, name: "Grande", priceCents: 5800, position: 1 },
        ],
        optionGroups: [
          {
            id: 1001,
            name: "Sabores",
            minSelect: 2,
            maxSelect: 2,
            pricingRule: "average",
            position: 0,
            options: [
              {
                id: 2001,
                name: "Calabresa",
                priceCents: 0,
                available: true,
                position: 0,
              },
              {
                id: 2002,
                name: "Marguerita",
                priceCents: 0,
                available: true,
                position: 1,
              },
              {
                id: 2003,
                name: "Quatro Queijos",
                priceCents: 500,
                available: true,
                position: 2,
              },
              {
                id: 2004,
                name: "Sabor Esgotado",
                priceCents: 0,
                available: false,
                position: 3,
              },
            ],
          },
          {
            id: 1002,
            name: "Borda",
            minSelect: 0,
            maxSelect: 1,
            pricingRule: "sum",
            position: 1,
            options: [
              {
                id: 2101,
                name: "Sem borda",
                priceCents: 0,
                available: true,
                position: 0,
              },
              {
                id: 2102,
                name: "Catupiry",
                priceCents: 800,
                available: true,
                position: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 2,
    name: "Lanches",
    position: 1,
    active: true,
    items: [
      {
        id: 20,
        categoryId: 2,
        name: "X-Burger",
        description: null,
        priceCents: 1800,
        imageUrl: null,
        available: true,
        active: true,
        position: 0,
        sizes: [],
        optionGroups: [
          {
            id: 1003,
            name: "Adicionais",
            minSelect: 0,
            maxSelect: 3,
            pricingRule: "sum",
            position: 0,
            options: [
              {
                id: 2201,
                name: "Bacon",
                priceCents: 400,
                available: true,
                position: 0,
              },
              {
                id: 2202,
                name: "Ovo",
                priceCents: 300,
                available: true,
                position: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 3,
    name: "Bebidas",
    position: 2,
    active: true,
    items: [
      {
        id: 30,
        categoryId: 3,
        name: "Coca 2L",
        description: null,
        priceCents: 1200,
        imageUrl: null,
        available: true,
        active: true,
        position: 0,
        sizes: [],
        optionGroups: [],
      },
      {
        id: 31,
        categoryId: 3,
        name: "Suco de Laranja",
        description: null,
        priceCents: 900,
        imageUrl: null,
        available: false,
        active: true,
        position: 1,
        sizes: [],
        optionGroups: [],
      },
    ],
  },
];

export const ZONES: DeliveryZone[] = [
  { id: 1, neighborhood: "Centro", feeCents: 500, active: true },
  { id: 2, neighborhood: "São Sebastião", feeCents: 800, active: true },
  { id: 3, neighborhood: "Bairro Fechado", feeCents: 900, active: false },
];

export const PRICING_SETTINGS: PricingSettings = {
  minOrderCents: 0,
  paymentMethods: ["pix", "cash", "card_on_delivery"],
  pickupEnabled: true,
  deliveryEnabled: true,
};

/** Carrinho pronto para confirmar: pizza grande meio a meio, entrega no Centro, Pix. */
export function readyCart(over: Partial<Cart> = {}): Cart {
  return {
    ...emptyCart(),
    items: [
      {
        itemId: 10,
        sizeId: 102,
        optionIds: [2001, 2003, 2102],
        quantity: 1,
        notes: null,
      },
    ],
    fulfillment: "delivery",
    address: {
      street: "Rua das Flores",
      number: "12",
      complement: null,
      reference: null,
      neighborhood: "Centro",
    },
    zoneId: 1,
    paymentMethod: "pix",
    ...over,
  };
}
