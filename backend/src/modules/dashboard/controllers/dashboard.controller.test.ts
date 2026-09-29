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

vi.mock("../services/dashboard.service.js", () => ({
  getDashboard: vi.fn(),
}));

const service = await import("../services/dashboard.service.js");
const { DashboardModule } = await import("../dashboard.module.js");
const { bearer, createTestApp } = await import("../../../test/nestApp.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const getDashboard = vi.mocked(service.getDashboard);

describe("GET /api/dashboard", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    app = await createTestApp(DashboardModule);
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
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    getDashboard.mockRejectedValue(new Error("db down"));

    const res = await request(app.getHttpServer())
      .get("/api/dashboard")
      .set("Authorization", bearer());

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("db down");
    logged.mockRestore();
  });
});
