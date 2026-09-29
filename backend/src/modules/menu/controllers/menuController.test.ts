import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/menu.service.js", () => ({
  createCategory: vi.fn(),
  createItem: vi.fn(),
  deleteCategory: vi.fn(),
  deleteItem: vi.fn(),
  getFullMenu: vi.fn(),
  reorderCategories: vi.fn(),
  reorderItems: vi.fn(),
  setItemAvailability: vi.fn(),
  updateCategory: vi.fn(),
  updateItem: vi.fn(),
}));
vi.mock("../storage/imageStorage.js", () => ({
  saveProductImage: vi.fn(),
}));

const service = await import("../services/menu.service.js");
const imageStorage = await import("../storage/imageStorage.js");
const {
  getMenu,
  postCategory,
  putCategory,
  deleteCategoryHandler,
  postItem,
  putItem,
  deleteItemHandler,
  patchItemAvailability,
  postItemImage,
} = await import("./menuController.js");

import { asTenantId } from "../../tenants/types/tenant.types.js";

const TENANT = asTenantId(1);
const AUTH_REQ = { auth: { userId: 9, tenantId: TENANT } };

function makeRes() {
  const res: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  } = { status: vi.fn(), json: vi.fn(), send: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMenu", () => {
  it("devolve o cardápio completo do tenant autenticado", async () => {
    (service.getFullMenu as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = makeRes();

    await getMenu({ ...AUTH_REQ } as never, res as never, vi.fn());

    expect(service.getFullMenu).toHaveBeenCalledWith(TENANT);
    expect(res.json.mock.calls[0]?.[0]).toEqual({ menu: [] });
  });
});

describe("postCategory", () => {
  it("cria e devolve 201", async () => {
    const category = { id: 1, name: "Pizzas", position: 0, active: true };
    (service.createCategory as ReturnType<typeof vi.fn>).mockResolvedValue(
      category,
    );
    const res = makeRes();

    await postCategory(
      { ...AUTH_REQ, body: { name: "Pizzas" } } as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0]?.[0]).toEqual({ category });
  });

  it("encaminha rejeições para next (wiring do asyncHandler)", async () => {
    const err = new Error("boom");
    (service.createCategory as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    const next = vi.fn();

    postCategory({ ...AUTH_REQ, body: {} } as never, makeRes() as never, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(err));
  });
});

describe("putCategory / deleteCategoryHandler", () => {
  it("putCategory passa o id numérico da rota", async () => {
    (service.updateCategory as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 5,
      name: "Pizzas",
      position: 0,
      active: true,
    });
    const res = makeRes();

    await putCategory(
      { ...AUTH_REQ, params: { id: "5" }, body: { name: "Pizzas" } } as never,
      res as never,
      vi.fn(),
    );

    expect(service.updateCategory).toHaveBeenCalledWith(TENANT, 5, {
      name: "Pizzas",
    });
  });

  it("deleteCategoryHandler devolve 204", async () => {
    (service.deleteCategory as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    const res = makeRes();

    await deleteCategoryHandler(
      { ...AUTH_REQ, params: { id: "5" } } as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe("itens", () => {
  it("postItem cria e devolve 201", async () => {
    const item = { id: 1, name: "Calabresa" };
    (service.createItem as ReturnType<typeof vi.fn>).mockResolvedValue(item);
    const res = makeRes();

    await postItem({ ...AUTH_REQ, body: {} } as never, res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0]?.[0]).toEqual({ item });
  });

  it("putItem passa o id numérico e o corpo ao serviço", async () => {
    (service.updateItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
    });
    const res = makeRes();

    await putItem(
      { ...AUTH_REQ, params: { id: "7" }, body: { name: "X" } } as never,
      res as never,
      vi.fn(),
    );

    expect(service.updateItem).toHaveBeenCalledWith(TENANT, 7, { name: "X" });
  });

  it("deleteItemHandler devolve 204", async () => {
    (service.deleteItem as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    const res = makeRes();

    await deleteItemHandler(
      { ...AUTH_REQ, params: { id: "7" } } as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(204);
  });

  it("patchItemAvailability lê `available` do corpo e devolve 204", async () => {
    (service.setItemAvailability as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    const res = makeRes();

    await patchItemAvailability(
      { ...AUTH_REQ, params: { id: "7" }, body: { available: false } } as never,
      res as never,
      vi.fn(),
    );

    expect(service.setItemAvailability).toHaveBeenCalledWith(TENANT, 7, false);
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe("postItemImage", () => {
  it("salva o arquivo e devolve a URL com 201", async () => {
    (
      imageStorage.saveProductImage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      url: "/produtos/abc.png",
    });
    const res = makeRes();
    const file = {
      buffer: Buffer.from("fake"),
      mimetype: "image/png",
    };

    await postItemImage({ ...AUTH_REQ, file } as never, res as never, vi.fn());

    expect(imageStorage.saveProductImage).toHaveBeenCalledWith(
      file.buffer,
      "image/png",
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ url: "/produtos/abc.png" });
  });

  it("encaminha image_required pra next quando não veio arquivo (asyncHandler)", async () => {
    const next = vi.fn();

    postItemImage(
      { ...AUTH_REQ, file: undefined } as never,
      makeRes() as never,
      next,
    );

    await vi.waitFor(() =>
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: "image_required" }),
      ),
    );
    expect(imageStorage.saveProductImage).not.toHaveBeenCalled();
  });
});
