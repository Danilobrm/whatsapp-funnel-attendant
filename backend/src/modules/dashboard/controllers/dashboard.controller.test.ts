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

const getDashboard = vi.fn();

const { DashboardController } = await import("./dashboard.controller.js");
const { DashboardService } = await import("../services/dashboard.service.js");
const { bearer, createControllerTestApp } =
  await import("../../../test/nestApp.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

describe("GET /api/dashboard", () => {
  let app: Awaited<ReturnType<typeof createControllerTestApp>>;

  beforeAll(async () => {
    app = await createControllerTestApp({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: { getDashboard } }],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devolve o dashboard do tenant autenticado", async () => {
    getDashboard.mockResolvedValue({ today: {} } as never);

    const res = await request(app.getHttpServer())
      .get("/api/dashboard")
      .set("Authorization", bearer(1, 6));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ dashboard: { today: {} } });
    expect(getDashboard).toHaveBeenCalledWith(asTenantId(6));
  });

  it("exige token", async () => {
    const res = await request(app.getHttpServer()).get("/api/dashboard");

    expect(res.status).toBe(401);
    expect(getDashboard).not.toHaveBeenCalled();
  });

  it("falha do serviço vira 500 seguro pelo filter, não derruba o processo", async () => {
    const logged = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    getDashboard.mockRejectedValue(new Error("db down"));

    const res = await request(app.getHttpServer())
      .get("/api/dashboard")
      .set("Authorization", bearer());

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("db down");
    logged.mockRestore();
  });
});
