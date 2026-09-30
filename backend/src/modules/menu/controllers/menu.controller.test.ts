import { Logger } from "@nestjs/common";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const service = {
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
};
const imageStorage = { saveProductImage: vi.fn() };

const { MenuController } = await import("./menu.controller.js");
const { MenuService } = await import("../services/menu.service.js");
const { ProductImageStorage } = await import("../storage/imageStorage.js");
const { MAX_IMAGE_BYTES } =
  await import("../interceptors/productImageUpload.interceptor.js");
const { bearer, createControllerTestApp } =
  await import("../../../test/nestApp.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const TENANT = asTenantId(1);
const fn = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;

describe("menu controller", () => {
  let app: Awaited<ReturnType<typeof createControllerTestApp>>;

  beforeAll(async () => {
    app = await createControllerTestApp({
      controllers: [MenuController],
      providers: [
        { provide: MenuService, useValue: service },
        { provide: ProductImageStorage, useValue: imageStorage },
      ],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const http = () => app.getHttpServer();
  const auth = () => bearer(9, 1);

  describe("GET /api/menu", () => {
    it("devolve o cardápio completo do tenant autenticado", async () => {
      fn(service.getFullMenu).mockResolvedValue([]);

      const res = await request(http())
        .get("/api/menu")
        .set("Authorization", auth());

      expect(res.status).toBe(200);
      expect(service.getFullMenu).toHaveBeenCalledWith(TENANT);
      expect(res.body).toEqual({ menu: [] });
    });

    it("exige token", async () => {
      const res = await request(http()).get("/api/menu");

      expect(res.status).toBe(401);
      expect(service.getFullMenu).not.toHaveBeenCalled();
    });
  });

  describe("categorias", () => {
    it("POST /categories cria e devolve 201", async () => {
      const category = { id: 1, name: "Pizzas", position: 0, active: true };
      fn(service.createCategory).mockResolvedValue(category);

      const res = await request(http())
        .post("/api/menu/categories")
        .set("Authorization", auth())
        .send({ name: "Pizzas" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ category });
      expect(service.createCategory).toHaveBeenCalledWith(TENANT, {
        name: "Pizzas",
      });
    });

    it("falha inesperada vira 500 seguro", async () => {
      const logged = vi
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});
      fn(service.createCategory).mockRejectedValue(new Error("boom"));

      const res = await request(http())
        .post("/api/menu/categories")
        .set("Authorization", auth())
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.code).toBe("internal_error");
      logged.mockRestore();
    });

    it("PUT /categories/:id passa o id numérico da rota", async () => {
      fn(service.updateCategory).mockResolvedValue({ id: 5 });

      const res = await request(http())
        .put("/api/menu/categories/5")
        .set("Authorization", auth())
        .send({ name: "Pizzas" });

      expect(res.status).toBe(200);
      expect(service.updateCategory).toHaveBeenCalledWith(TENANT, 5, {
        name: "Pizzas",
      });
    });

    it("id não numérico vira 422 item_not_found", async () => {
      const res = await request(http())
        .put("/api/menu/categories/abc")
        .set("Authorization", auth())
        .send({});

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: "item_not_found", field: "id" });
      expect(service.updateCategory).not.toHaveBeenCalled();
    });

    it("DELETE /categories/:id devolve 204 sem corpo", async () => {
      fn(service.deleteCategory).mockResolvedValue(undefined);

      const res = await request(http())
        .delete("/api/menu/categories/5")
        .set("Authorization", auth());

      expect(res.status).toBe(204);
      expect(res.text).toBe("");
      expect(service.deleteCategory).toHaveBeenCalledWith(TENANT, 5);
    });

    it("POST /categories/reorder devolve 204 e NÃO é lido como :id", async () => {
      fn(service.reorderCategories).mockResolvedValue(undefined);

      const res = await request(http())
        .post("/api/menu/categories/reorder")
        .set("Authorization", auth())
        .send({ orderedIds: [3, 1, 2] });

      expect(res.status).toBe(204);
      expect(service.reorderCategories).toHaveBeenCalledWith(TENANT, [3, 1, 2]);
    });

    it("reorder recusa orderedIds inválido com 422", async () => {
      const res = await request(http())
        .post("/api/menu/categories/reorder")
        .set("Authorization", auth())
        .send({ orderedIds: ["a"] });

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ field: "orderedIds" });
      expect(service.reorderCategories).not.toHaveBeenCalled();
    });
  });

  describe("itens", () => {
    it("POST /items cria e devolve 201", async () => {
      const item = { id: 1, name: "Calabresa" };
      fn(service.createItem).mockResolvedValue(item);

      const res = await request(http())
        .post("/api/menu/items")
        .set("Authorization", auth())
        .send({});

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ item });
    });

    it("PUT /items/:id passa o id numérico e o corpo ao serviço", async () => {
      fn(service.updateItem).mockResolvedValue({ id: 7 });

      const res = await request(http())
        .put("/api/menu/items/7")
        .set("Authorization", auth())
        .send({ name: "X" });

      expect(res.status).toBe(200);
      expect(service.updateItem).toHaveBeenCalledWith(TENANT, 7, { name: "X" });
    });

    it("DELETE /items/:id devolve 204", async () => {
      fn(service.deleteItem).mockResolvedValue(undefined);

      const res = await request(http())
        .delete("/api/menu/items/7")
        .set("Authorization", auth());

      expect(res.status).toBe(204);
      expect(service.deleteItem).toHaveBeenCalledWith(TENANT, 7);
    });

    it("PATCH /items/:id/availability lê `available` do corpo e devolve 204", async () => {
      fn(service.setItemAvailability).mockResolvedValue(undefined);

      const res = await request(http())
        .patch("/api/menu/items/7/availability")
        .set("Authorization", auth())
        .send({ available: false });

      expect(res.status).toBe(204);
      expect(service.setItemAvailability).toHaveBeenCalledWith(
        TENANT,
        7,
        false,
      );
    });

    it("`available` só vale true quando é literalmente true", async () => {
      fn(service.setItemAvailability).mockResolvedValue(undefined);

      await request(http())
        .patch("/api/menu/items/7/availability")
        .set("Authorization", auth())
        .send({ available: "true" });

      expect(service.setItemAvailability).toHaveBeenCalledWith(
        TENANT,
        7,
        false,
      );
    });

    it("POST /items/reorder devolve 204", async () => {
      fn(service.reorderItems).mockResolvedValue(undefined);

      const res = await request(http())
        .post("/api/menu/items/reorder")
        .set("Authorization", auth())
        .send({ orderedIds: [2, 1] });

      expect(res.status).toBe(204);
      expect(service.reorderItems).toHaveBeenCalledWith(TENANT, [2, 1]);
    });
  });

  describe("POST /api/menu/images", () => {
    const png = Buffer.from("fake-png");

    it("salva o arquivo e devolve a URL com 201", async () => {
      fn(imageStorage.saveProductImage).mockResolvedValue({
        url: "/produtos/abc.png",
      });

      const res = await request(http())
        .post("/api/menu/images")
        .set("Authorization", auth())
        .attach("image", png, { filename: "a.png", contentType: "image/png" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ url: "/produtos/abc.png" });
      expect(imageStorage.saveProductImage).toHaveBeenCalledWith(
        png,
        "image/png",
      );
    });

    it("recusa 422 image_required quando não veio arquivo", async () => {
      const res = await request(http())
        .post("/api/menu/images")
        .set("Authorization", auth())
        .field("outro", "campo");

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("image_required");
      expect(imageStorage.saveProductImage).not.toHaveBeenCalled();
    });

    it("recusa 422 image_invalid_type para arquivo que não é imagem", async () => {
      const res = await request(http())
        .post("/api/menu/images")
        .set("Authorization", auth())
        .attach("image", Buffer.from("x"), {
          filename: "a.txt",
          contentType: "text/plain",
        });

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        code: "image_invalid_type",
        field: "image",
      });
      expect(imageStorage.saveProductImage).not.toHaveBeenCalled();
    });

    it("recusa 422 image_too_large acima do limite (não 413)", async () => {
      const res = await request(http())
        .post("/api/menu/images")
        .set("Authorization", auth())
        .attach("image", Buffer.alloc(MAX_IMAGE_BYTES + 1), {
          filename: "grande.png",
          contentType: "image/png",
        });

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        code: "image_too_large",
        field: "image",
      });
      expect(imageStorage.saveProductImage).not.toHaveBeenCalled();
    });

    it("exige login ANTES de ler o arquivo", async () => {
      const res = await request(http())
        .post("/api/menu/images")
        .attach("image", png, { filename: "a.png", contentType: "image/png" });

      expect(res.status).toBe(401);
      expect(imageStorage.saveProductImage).not.toHaveBeenCalled();
    });
  });
});
