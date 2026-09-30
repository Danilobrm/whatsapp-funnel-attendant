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

const view = vi.fn();
const confirm = vi.fn();

const { PublicMenuController } = await import("./publicMenu.controller.js");
const { MenuLinkService } = await import("../services/menuLink.service.js");
const { UnauthorizedError } = await import("../../auth/errors/auth.errors.js");
const { InvalidPublicCartError } = await import("../errors/menuLink.errors.js");
const { bearer, createControllerTestApp } =
  await import("../../../test/nestApp.js");

describe("public menu controller", () => {
  let app: Awaited<ReturnType<typeof createControllerTestApp>>;

  beforeAll(async () => {
    app = await createControllerTestApp({
      controllers: [PublicMenuController],
      providers: [
        {
          provide: MenuLinkService,
          useValue: { getPublicMenuView: view, confirmPublicCart: confirm },
        },
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

  describe("GET /api/public/menu/:code", () => {
    it("is public (no token) and passes the URL code to the service", async () => {
      view.mockResolvedValue({ restaurant: { name: "Pizzaria" } } as never);

      const res = await request(http()).get("/api/public/menu/abc123");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ restaurant: { name: "Pizzaria" } });
      expect(view).toHaveBeenCalledWith("abc123");
    });

    it("maps an invalid/expired link to 401 with the code only", async () => {
      view.mockRejectedValue(new UnauthorizedError("expired_menu_link"));

      const res = await request(http()).get("/api/public/menu/abc123");

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        status: "unauthorized",
        code: "expired_menu_link",
      });
      expect(res.body).not.toHaveProperty("message");
    });

    it("a panel JWT in the header is irrelevant: the code is the credential", async () => {
      view.mockRejectedValue(new UnauthorizedError("invalid_menu_link"));

      const res = await request(http())
        .get("/api/public/menu/x")
        .set("Authorization", bearer());

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("invalid_menu_link");
      expect(view).toHaveBeenCalledWith("x");
    });
  });

  describe("POST /api/public/cart/:code", () => {
    it("confirms the cart and answers 200 (not 201)", async () => {
      confirm.mockResolvedValue({ notified: true } as never);
      const body = { items: [{ itemId: 1, quantity: 2 }] };

      const res = await request(http())
        .post("/api/public/cart/abc123")
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ cart: { notified: true } });
      expect(confirm).toHaveBeenCalledWith("abc123", body);
    });

    it("maps a refused cart to 422 with the line problems", async () => {
      confirm.mockRejectedValue(
        new InvalidPublicCartError("cart_invalid", [
          { code: "item_unavailable", lineIndex: 0 },
        ] as never),
      );

      const res = await request(http())
        .post("/api/public/cart/abc123")
        .send({ items: [] });

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        status: "invalid",
        code: "cart_invalid",
        problems: [{ code: "item_unavailable", lineIndex: 0 }],
      });
    });
  });

  describe("rate limit per IP", () => {
    let limitedApp: Awaited<ReturnType<typeof createControllerTestApp>>;

    beforeAll(async () => {
      // App próprio: o balde do guard é por instância e os testes acima já gastaram o do `app`.
      limitedApp = await createControllerTestApp({
        controllers: [PublicMenuController],
        providers: [
          {
            provide: MenuLinkService,
            useValue: { getPublicMenuView: view, confirmPublicCart: confirm },
          },
        ],
      });
    });
    afterAll(async () => {
      await limitedApp.close();
    });

    it("GET: 60 per minute, then 429 without touching the service", async () => {
      view.mockResolvedValue({} as never);
      const server = limitedApp.getHttpServer();

      for (let i = 0; i < 60; i += 1) {
        await request(server).get("/api/public/menu/c").expect(200);
      }
      view.mockClear();
      const res = await request(server).get("/api/public/menu/c");

      expect(res.status).toBe(429);
      expect(res.body).toMatchObject({
        status: "rate_limited",
        code: "rate_limited",
      });
      expect(view).not.toHaveBeenCalled();
    });

    it("POST has its own bucket: 20 per minute, unaffected by the GET bucket", async () => {
      confirm.mockResolvedValue({} as never);
      const server = limitedApp.getHttpServer();

      for (let i = 0; i < 20; i += 1) {
        await request(server).post("/api/public/cart/c").send({}).expect(200);
      }
      confirm.mockClear();
      const res = await request(server).post("/api/public/cart/c").send({});

      expect(res.status).toBe(429);
      expect(confirm).not.toHaveBeenCalled();
    });
  });
});
