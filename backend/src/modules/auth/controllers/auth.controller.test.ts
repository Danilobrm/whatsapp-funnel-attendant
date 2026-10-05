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

const login = vi.fn();
const currentUser = vi.fn();

const { AuthController } = await import("./auth.controller.js");
const { AuthService } = await import("../services/auth.service.js");
const { UnauthorizedError } = await import("../errors/auth.errors.js");
const { bearer, createControllerTestApp } =
  await import("../../../test/nestApp.js");

describe("auth controller", () => {
  let app: Awaited<ReturnType<typeof createControllerTestApp>>;

  beforeAll(async () => {
    app = await createControllerTestApp({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { login, currentUser } }],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const http = () => app.getHttpServer();

  describe("POST /api/auth/login", () => {
    it("is public and answers 200 (not 201) with the service result", async () => {
      login.mockResolvedValue({ token: "t", user: { id: 1 } } as never);

      const res = await request(http())
        .post("/api/auth/login")
        .send({ email: "a@b.com", password: "x" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ token: "t", user: { id: 1 } });
      expect(login).toHaveBeenCalledWith({ email: "a@b.com", password: "x" });
    });

    it("maps invalid credentials to 401 with the code only", async () => {
      login.mockRejectedValue(new UnauthorizedError("invalid_credentials"));

      const res = await request(http())
        .post("/api/auth/login")
        .send({ email: "a@b.com", password: "errada" });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        status: "unauthorized",
        code: "invalid_credentials",
      });
      expect(res.body).not.toHaveProperty("message");
    });
  });

  describe("GET /api/auth/me", () => {
    it("requires a token", async () => {
      const res = await request(http()).get("/api/auth/me");

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("missing_token");
      expect(currentUser).not.toHaveBeenCalled();
    });

    it("loads the user of the token", async () => {
      currentUser.mockResolvedValue({ id: 9, email: "a@b.com" } as never);

      const res = await request(http())
        .get("/api/auth/me")
        .set("Authorization", bearer(9, 2));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ user: { id: 9, email: "a@b.com" } });
      expect(currentUser).toHaveBeenCalledWith(9);
    });
  });
});
