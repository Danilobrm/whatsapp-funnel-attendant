import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/dashboard.service.js", () => ({
  getDashboard: vi.fn(),
}));

const service = await import("../services/dashboard.service.js");
const { getDashboardHandler } = await import("./dashboardController.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const TENANT = asTenantId(1);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDashboardHandler", () => {
  it("devolve o dashboard do tenant autenticado", async () => {
    (service.getDashboard as ReturnType<typeof vi.fn>).mockResolvedValue({
      today: {},
    });
    const res = { json: vi.fn() };

    await getDashboardHandler(
      { auth: { userId: 1, tenantId: TENANT } } as never,
      res as never,
      vi.fn(),
    );

    expect(service.getDashboard).toHaveBeenCalledWith(TENANT);
    expect(res.json).toHaveBeenCalledWith({ dashboard: { today: {} } });
  });

  it("falha do serviço vai para o errorHandler (next), não derruba o processo", async () => {
    const error = new Error("db down");
    (service.getDashboard as ReturnType<typeof vi.fn>).mockRejectedValue(error);
    const next = vi.fn();

    await getDashboardHandler(
      { auth: { userId: 1, tenantId: TENANT } } as never,
      { json: vi.fn() } as never,
      next,
    );

    // `asyncHandler` não devolve a promise — espera o `.catch(next)` rodar.
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(error));
  });
});
