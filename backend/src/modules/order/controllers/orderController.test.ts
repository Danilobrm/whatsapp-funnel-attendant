import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/order.service.js", () => ({
  createSampleOrder: vi.fn(),
  getOrder: vi.fn(),
  listBoard: vi.fn(),
  parseTransitionInput: vi.fn((body: unknown) => body),
  transitionOrder: vi.fn(),
}));

const service = await import("../services/order.service.js");
const { publishOrderEvent } =
  await import("../events/order.events.js");
const {
  getOrderById,
  getOrders,
  getOrderStream,
  postDevSample,
  postTransition,
  STREAM_HEARTBEAT_MS,
} = await import("./orderController.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(1);
const AUTH_REQ = { auth: { userId: 9, tenantId: TENANT } };

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("orderController", () => {
  it("getOrders devolve o quadro do tenant autenticado", async () => {
    mock(service.listBoard).mockResolvedValue([{ id: 1 }]);
    const res = makeRes();

    await getOrders({ ...AUTH_REQ } as never, res as never, vi.fn());

    expect(service.listBoard).toHaveBeenCalledWith(TENANT);
    expect(res.json).toHaveBeenCalledWith({ orders: [{ id: 1 }] });
  });

  it("getOrderById com id não numérico → next(InvalidOrderError invalid_id)", async () => {
    const next = vi.fn();
    await getOrderById(
      { ...AUTH_REQ, params: { id: "abc" } } as never,
      makeRes() as never,
      next,
    );

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "invalid_id" });
    expect(service.getOrder).not.toHaveBeenCalled();
  });

  it("postTransition encaminha tenant, id e corpo validado", async () => {
    mock(service.transitionOrder).mockResolvedValue({
      id: 5,
      status: "accepted",
    });
    const res = makeRes();

    await postTransition(
      { ...AUTH_REQ, params: { id: "5" }, body: { to: "accepted" } } as never,
      res as never,
      vi.fn(),
    );

    expect(service.transitionOrder).toHaveBeenCalledWith(TENANT, 5, {
      to: "accepted",
    });
    expect(res.json).toHaveBeenCalledWith({
      order: { id: 5, status: "accepted" },
    });
  });

  it("postDevSample cria para o usuário logado e responde 201", async () => {
    mock(service.createSampleOrder).mockResolvedValue({ id: 8 });
    const res = makeRes();

    await postDevSample({ ...AUTH_REQ } as never, res as never, vi.fn());

    expect(service.createSampleOrder).toHaveBeenCalledWith(TENANT, 9);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("getOrderStream", () => {
  it("abre SSE, repassa eventos do tenant e para ao fechar a conexão", () => {
    vi.useFakeTimers();
    const req = Object.assign(new EventEmitter(), AUTH_REQ);
    const res = makeRes();

    getOrderStream(req as never, res as never, vi.fn());

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/event-stream",
    );
    expect(res.flushHeaders).toHaveBeenCalled();

    publishOrderEvent(TENANT, {
      type: "order_created",
      order: { id: 1 } as never,
    });
    publishOrderEvent(asTenantId(2), {
      type: "order_created",
      order: { id: 2 } as never,
    });
    expect(res.write).toHaveBeenCalledWith(
      'event: order_created\ndata: {"id":1}\n\n',
    );
    expect(res.write).not.toHaveBeenCalledWith(
      expect.stringContaining('"id":2'),
    );

    vi.advanceTimersByTime(STREAM_HEARTBEAT_MS);
    expect(res.write).toHaveBeenCalledWith(": ping\n\n");

    req.emit("close");
    res.write.mockClear();
    publishOrderEvent(TENANT, {
      type: "order_updated",
      order: { id: 1 } as never,
    });
    vi.advanceTimersByTime(STREAM_HEARTBEAT_MS);
    expect(res.write).not.toHaveBeenCalled();
  });
});
