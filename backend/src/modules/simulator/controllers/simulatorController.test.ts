import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../conversation/repositories/conversation.repository.js", () => ({
  deleteConversation: vi.fn(),
  findMessagesByContact: vi.fn(),
}));
vi.mock("../../conversation/services/conversation.service.js", () => ({
  handleInboundMessage: vi.fn(),
}));
vi.mock(
  "../services/simulator.service.js",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../services/simulator.service.js")
    >()),
    createCustomer: vi.fn(),
    getSimulatorCart: vi.fn(),
    listCustomers: vi.fn(),
  }),
);

const convRepo =
  await import("../../conversation/repositories/conversation.repository.js");
const convService =
  await import("../../conversation/services/conversation.service.js");
const simulator = await import("../services/simulator.service.js");
const controller = await import("./simulatorController.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(1);
const AUTH = { userId: 9, tenantId: TENANT };

function req(over: Record<string, unknown> = {}) {
  return { auth: AUTH, query: {}, body: {}, ...over } as never;
}
function res() {
  const r = { json: vi.fn(), status: vi.fn(), end: vi.fn() };
  r.status.mockReturnValue(r);
  return r;
}
/** `asyncHandler` não devolve a promise — espera o efeito. */
async function settle(assertion: () => void) {
  await vi.waitFor(assertion);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("postSimulatorMessage", () => {
  it("uses the SAME entry point as WhatsApp, on the simulator channel and the admin's contact", async () => {
    mock(convService.handleInboundMessage).mockResolvedValue({
      duplicate: false,
      replies: ["Oi!"],
      provider: "agent",
      trace: [{ name: "view_cart", args: {}, result: { ok: true } }],
    });
    mock(simulator.getSimulatorCart).mockResolvedValue(null);
    const r = res();

    controller.postSimulatorMessage(
      req({ body: { text: "oi" } }),
      r as never,
      vi.fn(),
    );

    await settle(() => expect(r.json).toHaveBeenCalled());
    expect(convService.handleInboundMessage).toHaveBeenCalledWith(TENANT, {
      channel: "simulator",
      contact: "admin-9",
      text: "oi",
    });
    expect(r.json).toHaveBeenCalledWith({
      replies: ["Oi!"],
      provider: "agent",
      debug: {
        toolCalls: [{ name: "view_cart", args: {}, result: { ok: true } }],
        cart: null,
      },
    });
  });

  it("routes to a simulated customer with contactId in the body", async () => {
    mock(convService.handleInboundMessage).mockResolvedValue({
      duplicate: false,
      replies: [],
      provider: "persona",
    });
    mock(simulator.getSimulatorCart).mockResolvedValue(null);
    const r = res();

    controller.postSimulatorMessage(
      req({ body: { text: "oi", contactId: "5561990000001" } }),
      r as never,
      vi.fn(),
    );

    await settle(() => expect(r.json).toHaveBeenCalled());
    expect(convService.handleInboundMessage).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ contact: "sim-5561990000001" }),
    );
    expect(simulator.getSimulatorCart).toHaveBeenCalledWith(
      TENANT,
      "sim-5561990000001",
    );
    // Sem trace (persona) → lista vazia, nunca undefined.
    expect(r.json.mock.calls[0]?.[0].debug.toolCalls).toEqual([]);
  });

  it("rejects an invalid contactId with a typed error, before any processing", async () => {
    const next = vi.fn();

    controller.postSimulatorMessage(
      req({ body: { text: "oi", contactId: "x" } }),
      res() as never,
      next,
    );

    await settle(() => expect(next).toHaveBeenCalled());
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "invalid_contact" });
    expect(convService.handleInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects empty and too long text", async () => {
    const next = vi.fn();
    controller.postSimulatorMessage(
      req({ body: { text: "  " } }),
      res() as never,
      next,
    );
    await settle(() => expect(next).toHaveBeenCalledTimes(1));
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "text_required" });

    const next2 = vi.fn();
    controller.postSimulatorMessage(
      req({ body: { text: "a".repeat(controller.MAX_SIMULATOR_CHARS + 1) } }),
      res() as never,
      next2,
    );
    await settle(() => expect(next2).toHaveBeenCalledTimes(1));
    expect(next2.mock.calls[0]?.[0]).toMatchObject({ code: "text_too_long" });
  });
});

describe("conversation / cart / reset", () => {
  it("reads the history of the chosen contact (query contactId)", async () => {
    mock(convRepo.findMessagesByContact).mockResolvedValue([]);
    const r = res();

    controller.getSimulatorConversation(
      req({ query: { contactId: "5561990000001" } }),
      r as never,
      vi.fn(),
    );

    await settle(() => expect(r.json).toHaveBeenCalledWith({ items: [] }));
    expect(convRepo.findMessagesByContact).toHaveBeenCalledWith(
      TENANT,
      "simulator",
      "sim-5561990000001",
      100,
    );
  });

  it("returns the cart of the chosen contact", async () => {
    mock(simulator.getSimulatorCart).mockResolvedValue({ total: "R$ 1,00" });
    const r = res();

    controller.getSimulatorCartHandler(req(), r as never, vi.fn());

    await settle(() =>
      expect(r.json).toHaveBeenCalledWith({ cart: { total: "R$ 1,00" } }),
    );
    expect(simulator.getSimulatorCart).toHaveBeenCalledWith(TENANT, "admin-9");
  });

  it("resets only the chosen contact's conversation", async () => {
    const r = res();

    controller.deleteSimulatorConversation(
      req({ query: { contactId: "5561990000001" } }),
      r as never,
      vi.fn(),
    );

    await settle(() => expect(r.status).toHaveBeenCalledWith(204));
    expect(convRepo.deleteConversation).toHaveBeenCalledWith(
      TENANT,
      "simulator",
      "sim-5561990000001",
    );
  });
});

describe("customers", () => {
  it("lists the tenant's simulated customers", async () => {
    mock(simulator.listCustomers).mockResolvedValue([{ contactId: "1" }]);
    const r = res();

    controller.getSimulatorCustomers(req(), r as never, vi.fn());

    await settle(() =>
      expect(r.json).toHaveBeenCalledWith({ items: [{ contactId: "1" }] }),
    );
    expect(simulator.listCustomers).toHaveBeenCalledWith(TENANT);
  });

  it("creates one and answers 201", async () => {
    mock(simulator.createCustomer).mockResolvedValue({
      contactId: "5561990000001",
    });
    const r = res();
    const body = { name: "Ana", phone: "5561990000001" };

    controller.postSimulatorCustomer(req({ body }), r as never, vi.fn());

    await settle(() => expect(r.status).toHaveBeenCalledWith(201));
    expect(simulator.createCustomer).toHaveBeenCalledWith(TENANT, body);
    expect(r.json).toHaveBeenCalledWith({
      customer: { contactId: "5561990000001" },
    });
  });

  it("a service failure goes to the error handler, not the process", async () => {
    const error = new Error("db down");
    mock(simulator.listCustomers).mockRejectedValue(error);
    const next = vi.fn();

    controller.getSimulatorCustomers(req(), res() as never, next);

    await settle(() => expect(next).toHaveBeenCalledWith(error));
  });
});
