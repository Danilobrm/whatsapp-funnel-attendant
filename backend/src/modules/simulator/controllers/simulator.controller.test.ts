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

const convRepo = {
  deleteConversation: vi.fn(),
  findMessagesByContact: vi.fn(),
};
const convService = { handleInboundMessage: vi.fn() };
const simulator = {
  createCustomer: vi.fn(),
  getSimulatorCart: vi.fn(),
  listCustomers: vi.fn(),
};

const { SimulatorController, MAX_SIMULATOR_CHARS } =
  await import("./simulator.controller.js");
const { ConversationRepository } =
  await import("../../conversation/repositories/conversation.repository.js");
const { ConversationService } =
  await import("../../conversation/services/conversation.service.js");
const { SimulatorService } = await import("../services/simulator.service.js");
const { bearer, createControllerTestApp } =
  await import("../../../test/nestApp.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(1);

describe("simulator controller", () => {
  let app: Awaited<ReturnType<typeof createControllerTestApp>>;

  beforeAll(async () => {
    app = await createControllerTestApp({
      controllers: [SimulatorController],
      providers: [
        { provide: ConversationRepository, useValue: convRepo },
        { provide: ConversationService, useValue: convService },
        { provide: SimulatorService, useValue: simulator },
      ],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const http = () => app.getHttpServer();
  const auth = () => bearer(9, 1);

  describe("POST /api/simulator/messages", () => {
    it("uses the SAME entry point as WhatsApp, on the simulator channel and the admin's contact (200, not 201)", async () => {
      mock(convService.handleInboundMessage).mockResolvedValue({
        duplicate: false,
        replies: ["Oi!"],
        provider: "agent",
        trace: [{ name: "view_cart", args: {}, result: { ok: true } }],
      });
      mock(simulator.getSimulatorCart).mockResolvedValue(null);

      const res = await request(http())
        .post("/api/simulator/messages")
        .set("Authorization", auth())
        .send({ text: "oi" });

      expect(res.status).toBe(200);
      expect(convService.handleInboundMessage).toHaveBeenCalledWith(TENANT, {
        channel: "simulator",
        contact: "admin-9",
        text: "oi",
      });
      expect(res.body).toEqual({
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

      const res = await request(http())
        .post("/api/simulator/messages")
        .set("Authorization", auth())
        .send({ text: "oi", contactId: "5561990000001" });

      expect(convService.handleInboundMessage).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ contact: "sim-5561990000001" }),
      );
      expect(simulator.getSimulatorCart).toHaveBeenCalledWith(
        TENANT,
        "sim-5561990000001",
      );
      // Sem trace (persona) → lista vazia, nunca undefined.
      expect(res.body.debug.toolCalls).toEqual([]);
    });

    it("also accepts contactId in the query string", async () => {
      mock(convService.handleInboundMessage).mockResolvedValue({
        duplicate: false,
        replies: [],
        provider: "persona",
      });
      mock(simulator.getSimulatorCart).mockResolvedValue(null);

      await request(http())
        .post("/api/simulator/messages?contactId=5561990000002")
        .set("Authorization", auth())
        .send({ text: "oi" });

      expect(convService.handleInboundMessage).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ contact: "sim-5561990000002" }),
      );
    });

    it("rejects an invalid contactId with a typed error, before any processing", async () => {
      const res = await request(http())
        .post("/api/simulator/messages")
        .set("Authorization", auth())
        .send({ text: "oi", contactId: "x" });

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: "invalid_contact" });
      expect(convService.handleInboundMessage).not.toHaveBeenCalled();
    });

    it("rejects empty text", async () => {
      const res = await request(http())
        .post("/api/simulator/messages")
        .set("Authorization", auth())
        .send({ text: "  " });

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: "text_required", field: "text" });
    });

    it("rejects too long text", async () => {
      const res = await request(http())
        .post("/api/simulator/messages")
        .set("Authorization", auth())
        .send({ text: "a".repeat(MAX_SIMULATOR_CHARS + 1) });

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: "text_too_long" });
      expect(convService.handleInboundMessage).not.toHaveBeenCalled();
    });

    it("requires a token", async () => {
      const res = await request(http())
        .post("/api/simulator/messages")
        .send({ text: "oi" });

      expect(res.status).toBe(401);
      expect(convService.handleInboundMessage).not.toHaveBeenCalled();
    });
  });

  describe("conversation / cart / reset", () => {
    it("reads the history of the chosen contact (query contactId)", async () => {
      mock(convRepo.findMessagesByContact).mockResolvedValue([]);

      const res = await request(http())
        .get("/api/simulator/conversation?contactId=5561990000001")
        .set("Authorization", auth());

      expect(res.body).toEqual({ items: [] });
      expect(convRepo.findMessagesByContact).toHaveBeenCalledWith(
        TENANT,
        "simulator",
        "sim-5561990000001",
        100,
      );
    });

    it("reads the admin's own history by default", async () => {
      mock(convRepo.findMessagesByContact).mockResolvedValue([]);

      await request(http())
        .get("/api/simulator/conversation")
        .set("Authorization", auth());

      expect(convRepo.findMessagesByContact).toHaveBeenCalledWith(
        TENANT,
        "simulator",
        "admin-9",
        100,
      );
    });

    it("returns the cart of the chosen contact", async () => {
      mock(simulator.getSimulatorCart).mockResolvedValue({ total: "R$ 1,00" });

      const res = await request(http())
        .get("/api/simulator/cart")
        .set("Authorization", auth());

      expect(res.body).toEqual({ cart: { total: "R$ 1,00" } });
      expect(simulator.getSimulatorCart).toHaveBeenCalledWith(
        TENANT,
        "admin-9",
      );
    });

    it("resets only the chosen contact's conversation (204, no body)", async () => {
      const res = await request(http())
        .delete("/api/simulator/conversation?contactId=5561990000001")
        .set("Authorization", auth());

      expect(res.status).toBe(204);
      expect(res.text).toBe("");
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

      const res = await request(http())
        .get("/api/simulator/customers")
        .set("Authorization", auth());

      expect(res.body).toEqual({ items: [{ contactId: "1" }] });
      expect(simulator.listCustomers).toHaveBeenCalledWith(TENANT);
    });

    it("creates one and answers 201", async () => {
      mock(simulator.createCustomer).mockResolvedValue({
        contactId: "5561990000001",
      });
      const body = { name: "Ana", phone: "5561990000001" };

      const res = await request(http())
        .post("/api/simulator/customers")
        .set("Authorization", auth())
        .send(body);

      expect(res.status).toBe(201);
      expect(simulator.createCustomer).toHaveBeenCalledWith(TENANT, body);
      expect(res.body).toEqual({ customer: { contactId: "5561990000001" } });
    });

    it("a service failure becomes a safe 500, not a process crash", async () => {
      const logged = vi
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});
      mock(simulator.listCustomers).mockRejectedValue(new Error("db down"));

      const res = await request(http())
        .get("/api/simulator/customers")
        .set("Authorization", auth());

      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain("db down");
      logged.mockRestore();
    });
  });
});
