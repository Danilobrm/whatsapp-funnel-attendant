import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = {
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
};
const { asTenantId } = await import("../../tenants/types/tenant.types.js");
const { MenuService } = await import("./menu.service.js");
const { bound } = await import("../../../test/bind.js");
const service = new MenuService(repo as never);
const {
  createItem,
  updateItem,
  deleteItem,
  setItemAvailability,
  getPublishedMenu,
  invalidateMenuCache,
} = bound(service, [
  "createItem",
  "updateItem",
  "deleteItem",
  "setItemAvailability",
  "getPublishedMenu",
  "invalidateMenuCache",
]);

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
