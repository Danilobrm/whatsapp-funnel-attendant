import { describe, expect, it } from "vitest";

import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import { parseCategoryInput, parseItemInput } from "./menu.parse.js";

const VALID_ITEM = {
  categoryId: 1,
  name: "Calabresa",
  description: "Molho, mussarela e calabresa",
  priceCents: 4500,
  imageUrl: null,
  available: true,
  active: true,
  position: 0,
  sizes: [],
  optionGroups: [],
};

describe("parseCategoryInput", () => {
  it("rejeita nome vazio", () => {
    expect(() => parseCategoryInput({ name: "  " })).toThrow(InvalidMenuError);
  });

  it("aceita entrada mínima com defaults", () => {
    expect(parseCategoryInput({ name: "Pizzas" })).toEqual({
      name: "Pizzas",
      position: 0,
      active: true,
    });
  });
});

describe("parseItemInput", () => {
  it("rejeita sem preço e sem tamanho", () => {
    try {
      parseItemInput({ ...VALID_ITEM, priceCents: null, sizes: [] });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidMenuError);
      expect((err as InstanceType<typeof InvalidMenuError>).code).toBe(
        "price_or_sizes_required",
      );
    }
  });

  it("aceita sem preço quando há tamanhos", () => {
    const parsed = parseItemInput({
      ...VALID_ITEM,
      priceCents: null,
      sizes: [{ name: "Grande", priceCents: 6000 }],
    });
    expect(parsed.priceCents).toBeNull();
    expect(parsed.sizes).toEqual([
      { name: "Grande", priceCents: 6000, position: 0 },
    ]);
  });

  it("rejeita min_select > max_select num grupo de opções", () => {
    try {
      parseItemInput({
        ...VALID_ITEM,
        optionGroups: [
          {
            name: "Sabores",
            minSelect: 2,
            maxSelect: 1,
            pricingRule: "average",
            options: [{ name: "Calabresa", priceCents: 0 }],
          },
        ],
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidMenuError);
      expect((err as InstanceType<typeof InvalidMenuError>).code).toBe(
        "min_greater_than_max",
      );
    }
  });

  it("rejeita pricing_rule desconhecida", () => {
    expect(() =>
      parseItemInput({
        ...VALID_ITEM,
        optionGroups: [
          {
            name: "Sabores",
            minSelect: 1,
            maxSelect: 2,
            pricingRule: "median",
            options: [{ name: "Calabresa", priceCents: 0 }],
          },
        ],
      }),
    ).toThrow(InvalidMenuError);
  });

  it("aceita grupo de meio a meio (max_select 2, pricing average)", () => {
    const parsed = parseItemInput({
      ...VALID_ITEM,
      optionGroups: [
        {
          name: "Sabores",
          minSelect: 1,
          maxSelect: 2,
          pricingRule: "average",
          options: [
            { name: "Calabresa", priceCents: 0 },
            { name: "Marguerita", priceCents: 500 },
          ],
        },
      ],
    });
    expect(parsed.optionGroups[0]).toMatchObject({
      pricingRule: "average",
      maxSelect: 2,
    });
    expect(parsed.optionGroups[0]?.options).toHaveLength(2);
  });

  it("rejeita categoria ausente", () => {
    expect(() =>
      parseItemInput({ ...VALID_ITEM, categoryId: undefined }),
    ).toThrow(InvalidMenuError);
  });

  it("rejeita preço negativo", () => {
    expect(() => parseItemInput({ ...VALID_ITEM, priceCents: -100 })).toThrow(
      InvalidMenuError,
    );
  });
});
