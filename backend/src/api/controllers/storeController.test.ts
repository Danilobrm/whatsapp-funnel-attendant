import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../modules/store/store.service.js", () => ({
  createZone: vi.fn(),
  getStoreSettings: vi.fn(),
  listZones: vi.fn(),
  removeZone: vi.fn(),
  updateStoreSettings: vi.fn(),
  updateZone: vi.fn(),
}));

const service = await import("../../modules/store/store.service.js");
const {
  getStore,
  putStore,
  getZones,
  postZone,
  putZone,
  deleteZone,
} = await import("./storeController.js");

import { asTenantId } from "../../modules/tenants/tenant.types.js";

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

describe("getStore / putStore", () => {
  it("getStore devolve as configurações do tenant autenticado", async () => {
    const settings = { timezone: "America/Sao_Paulo" };
    (service.getStoreSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      settings,
    );
    const res = makeRes();

    await getStore({ ...AUTH_REQ } as never, res as never, vi.fn());

    expect(service.getStoreSettings).toHaveBeenCalledWith(TENANT);
    expect(res.json.mock.calls[0]?.[0]).toEqual({ settings });
  });

  it("putStore encaminha o corpo ao serviço", async () => {
    const settings = { timezone: "America/Sao_Paulo" };
    (service.updateStoreSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      settings,
    );
    const res = makeRes();
    const body = { timezone: "America/Sao_Paulo" };

    await putStore({ ...AUTH_REQ, body } as never, res as never, vi.fn());

    expect(service.updateStoreSettings).toHaveBeenCalledWith(TENANT, body);
  });

  it("encaminha rejeições para next (wiring do asyncHandler)", async () => {
    const err = new Error("boom");
    (service.updateStoreSettings as ReturnType<typeof vi.fn>).mockRejectedValue(
      err,
    );
    const next = vi.fn();

    putStore({ ...AUTH_REQ, body: {} } as never, makeRes() as never, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(err));
  });
});

describe("zonas de entrega", () => {
  it("getZones lista as zonas do tenant", async () => {
    (service.listZones as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = makeRes();

    await getZones({ ...AUTH_REQ } as never, res as never, vi.fn());

    expect(service.listZones).toHaveBeenCalledWith(TENANT);
    expect(res.json.mock.calls[0]?.[0]).toEqual({ zones: [] });
  });

  it("postZone cria e devolve 201", async () => {
    const zone = { id: 1, neighborhood: "Centro", feeCents: 500, active: true };
    (service.createZone as ReturnType<typeof vi.fn>).mockResolvedValue(zone);
    const res = makeRes();

    await postZone({ ...AUTH_REQ, body: {} } as never, res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0]?.[0]).toEqual({ zone });
  });

  it("putZone passa o id numérico da rota", async () => {
    (service.updateZone as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 3,
    });
    const res = makeRes();

    await putZone(
      { ...AUTH_REQ, params: { id: "3" }, body: {} } as never,
      res as never,
      vi.fn(),
    );

    expect(service.updateZone).toHaveBeenCalledWith(TENANT, 3, {});
  });

  it("deleteZone devolve 204", async () => {
    (service.removeZone as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    const res = makeRes();

    await deleteZone(
      { ...AUTH_REQ, params: { id: "3" } } as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(204);
  });
});
