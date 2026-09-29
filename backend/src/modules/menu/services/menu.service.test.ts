import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/menu.repository.js", () => ({
  createCategory: vi.fn(),
  createItem: vi.fn(),
  deleteCategory: vi.fn(),
  deleteItem: vi.fn(),
  getActiveMenu: vi.fn(),
  getFullMenu: vi.fn(),
  listCategories: vi.fn(),
  reorderCategories: vi.fn(),
  reorderItems: vi.fn(),
  updateCategory: vi.fn(),
  updateItem: vi.fn(),
  updateItemAvailability: vi.fn(),
}));

const repo = await import("../repositories/menu.repository.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");
const { InvalidMenuError } = await import("../../errors/invalidMenu.error.js");
const {
  parseCategoryInput,
  parseItemInput,
  createItem,
  updateItem,
  deleteItem,
  setItemAvailability,
  getPublishedMenu,
  invalidateMenuCache,
} = await import("./menu.service.js");

const TENANT = asTenantId(4);

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

beforeEach(() => {
  vi.resetAllMocks();
  invalidateMenuCache();
});

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

describe("createItem / updateItem / deleteItem", () => {
  it("createItem invalida o cache do cardápio publicado", async () => {
    (repo.createItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...VALID_ITEM,
      id: 1,
    });
    (repo.getActiveMenu as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getPublishedMenu(TENANT);
    await createItem(TENANT, VALID_ITEM);
    await getPublishedMenu(TENANT);

    expect(repo.getActiveMenu).toHaveBeenCalledTimes(2);
  });

  it("updateItem lança item_not_found quando o repositório devolve null", async () => {
    (repo.updateItem as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(updateItem(TENANT, 999, VALID_ITEM)).rejects.toMatchObject({
      code: "item_not_found",
    });
  });

  it("deleteItem lança item_not_found quando nada foi apagado", async () => {
    (repo.deleteItem as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(deleteItem(TENANT, 999)).rejects.toMatchObject({
      code: "item_not_found",
    });
  });

  it("setItemAvailability lança item_not_found quando o item não é do tenant", async () => {
    (repo.updateItemAvailability as ReturnType<typeof vi.fn>).mockResolvedValue(
      false,
    );

    await expect(setItemAvailability(TENANT, 999, false)).rejects.toMatchObject(
      {
        code: "item_not_found",
      },
    );
  });
});

describe("getPublishedMenu", () => {
  it("usa cache na segunda leitura", async () => {
    (repo.getActiveMenu as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getPublishedMenu(TENANT);
    await getPublishedMenu(TENANT);

    expect(repo.getActiveMenu).toHaveBeenCalledTimes(1);
  });
});
