import { request as httpRequest } from "node:http";

import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const service = {
  createSampleOrder: vi.fn(),
  getOrder: vi.fn(),
  listBoard: vi.fn(),
  transitionOrder: vi.fn(),
};

// Barramento REAL (o teste publica eventos nele); só o `off` é espionado.
const { OrderEvents } = await import("../events/order.events.js");
const realEvents = new OrderEvents();
const unsubscribed = vi.fn();
const events = {
  publishOrderEvent: realEvents.publishOrderEvent.bind(realEvents),
  subscribeOrders: (...args: Parameters<typeof realEvents.subscribeOrders>) => {
    const off = realEvents.subscribeOrders(...args);
    return () => {
      off();
      unsubscribed();
    };
  },
};
const publishOrderEvent = events.publishOrderEvent;

const { OrderController, STREAM_HEARTBEAT_MS } =
  await import("./order.controller.js");
const { OrderService } = await import("../services/order.service.js");
const { InvalidTransitionError, OrderNotFoundError } =
  await import("../errors/order.errors.js");
const { env } = await import("../../../config/env.js");
const { bearer, createControllerTestApp } =
  await import("../../../test/nestApp.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(1);

describe("order controller", () => {
  let app: Awaited<ReturnType<typeof createControllerTestApp>>;

  beforeAll(async () => {
    app = await createControllerTestApp({
      controllers: [OrderController],
      providers: [
        { provide: OrderService, useValue: service },
        { provide: OrderEvents, useValue: events },
      ],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const http = () => app.getHttpServer();
  const auth = () => bearer(9, 1);

  describe("GET /api/orders", () => {
    it("devolve o quadro do tenant autenticado", async () => {
      mock(service.listBoard).mockResolvedValue([{ id: 1 }]);

      const res = await request(http())
        .get("/api/orders")
        .set("Authorization", auth());

      expect(res.status).toBe(200);
      expect(service.listBoard).toHaveBeenCalledWith(TENANT);
      expect(res.body).toEqual({ orders: [{ id: 1 }] });
    });

    it("exige token", async () => {
      const res = await request(http()).get("/api/orders");

      expect(res.status).toBe(401);
      expect(service.listBoard).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/orders/:id", () => {
    it("devolve o pedido", async () => {
      mock(service.getOrder).mockResolvedValue({ id: 4 });

      const res = await request(http())
        .get("/api/orders/4")
        .set("Authorization", auth());

      expect(res.body).toEqual({ order: { id: 4 } });
      expect(service.getOrder).toHaveBeenCalledWith(TENANT, 4);
    });

    it("id não numérico → 422 invalid_id, sem chamar o serviço", async () => {
      const res = await request(http())
        .get("/api/orders/abc")
        .set("Authorization", auth());

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: "invalid_id", field: "id" });
      expect(service.getOrder).not.toHaveBeenCalled();
    });

    it("pedido de outro tenant/inexistente → 404 order_not_found", async () => {
      mock(service.getOrder).mockRejectedValue(new OrderNotFoundError());

      const res = await request(http())
        .get("/api/orders/9")
        .set("Authorization", auth());

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("order_not_found");
    });
  });

  describe("POST /api/orders/:id/transition", () => {
    it("encaminha tenant, id e corpo validado (200, não 201)", async () => {
      mock(service.transitionOrder).mockResolvedValue({
        id: 5,
        status: "accepted",
      });

      const res = await request(http())
        .post("/api/orders/5/transition")
        .set("Authorization", auth())
        .send({ to: "accepted" });

      expect(res.status).toBe(200);
      expect(service.transitionOrder).toHaveBeenCalledWith(TENANT, 5, {
        to: "accepted",
      });
      expect(res.body).toEqual({ order: { id: 5, status: "accepted" } });
    });

    it("transição inválida → 409 com from/to", async () => {
      mock(service.transitionOrder).mockRejectedValue(
        new InvalidTransitionError("completed", "accepted"),
      );

      const res = await request(http())
        .post("/api/orders/5/transition")
        .set("Authorization", auth())
        .send({ to: "accepted" });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        code: "invalid_transition",
        from: "completed",
        to: "accepted",
      });
    });
  });

  describe("POST /api/orders/dev-sample", () => {
    it("cria para o usuário logado e responde 201", async () => {
      mock(service.createSampleOrder).mockResolvedValue({ id: 8 });

      const res = await request(http())
        .post("/api/orders/dev-sample")
        .set("Authorization", auth());

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ order: { id: 8 } });
      expect(service.createSampleOrder).toHaveBeenCalledWith(TENANT, 9);
    });

    it("em produção a rota não existe (404) e nada é criado", async () => {
      const original = env.nodeEnv;
      env.nodeEnv = "production";
      try {
        const res = await request(http())
          .post("/api/orders/dev-sample")
          .set("Authorization", auth());

        expect(res.status).toBe(404);
        expect(service.createSampleOrder).not.toHaveBeenCalled();
      } finally {
        env.nodeEnv = original;
      }
    });
  });

  describe("GET /api/orders/stream (SSE)", () => {
    beforeAll(async () => {
      await app.listen(0);
    });

    /** Abre o stream de verdade e junta o que chega, para asserir o formato de fio. */
    async function openStream(token: string) {
      const { port } = app.getHttpServer().address() as { port: number };
      const chunks: string[] = [];
      let headers: Record<string, unknown> = {};
      let status = 0;

      const req = httpRequest({
        host: "127.0.0.1",
        port,
        path: "/api/orders/stream",
        headers: { Authorization: token },
      });
      await new Promise<void>((resolve, reject) => {
        req.on("response", (res) => {
          status = res.statusCode ?? 0;
          headers = res.headers;
          res.setEncoding("utf8");
          res.on("data", (c: string) => chunks.push(c));
          resolve();
        });
        req.on("error", reject);
        req.end();
      });
      const text = () => chunks.join("");
      return { req, status, headers, text };
    }

    it("abre SSE com os headers certos e o comentário inicial", async () => {
      const s = await openStream(auth());
      try {
        expect(s.status).toBe(200);
        expect(s.headers["content-type"]).toContain("text/event-stream");
        expect(s.headers["cache-control"]).toBe("no-cache, no-transform");
        expect(s.headers["x-accel-buffering"]).toBe("no");
        await vi.waitFor(() => expect(s.text()).toContain(": connected\n\n"));
      } finally {
        s.req.destroy();
      }
    });

    it("repassa só os eventos do tenant do token, no formato de fio", async () => {
      const s = await openStream(auth());
      try {
        await vi.waitFor(() => expect(s.text()).toContain(": connected"));

        publishOrderEvent(TENANT, {
          type: "order_created",
          order: { id: 1 } as never,
        });
        publishOrderEvent(asTenantId(2), {
          type: "order_created",
          order: { id: 2 } as never,
        });

        await vi.waitFor(() =>
          expect(s.text()).toContain(
            'event: order_created\ndata: {"id":1}\n\n',
          ),
        );
        expect(s.text()).not.toContain('"id":2');
      } finally {
        s.req.destroy();
      }
    });

    it("manda ping a cada STREAM_HEARTBEAT_MS", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const s = await openStream(auth());
      try {
        await vi.waitFor(() => expect(s.text()).toContain(": connected"));

        vi.advanceTimersByTime(STREAM_HEARTBEAT_MS);

        await vi.waitFor(() => expect(s.text()).toContain(": ping\n\n"));
      } finally {
        s.req.destroy();
      }
    });

    it("ao fechar a conexão para de escutar (sem vazar listener nem ping)", async () => {
      const s = await openStream(auth());
      await vi.waitFor(() => expect(s.text()).toContain(": connected"));

      s.req.destroy();

      await vi.waitFor(() => expect(unsubscribed).toHaveBeenCalledTimes(1));
    });

    it("sem token responde 401 JSON, não abre stream", async () => {
      const res = await request(http()).get("/api/orders/stream");

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("missing_token");
    });

    it("`/stream` não é lido como :id", async () => {
      const s = await openStream(auth());
      try {
        expect(s.status).toBe(200);
        expect(service.getOrder).not.toHaveBeenCalled();
      } finally {
        s.req.destroy();
      }
    });
  });

  describe("shutdown com o stream aberto (Ctrl+C / restart do watch)", () => {
    it("app.close() NÃO trava: encerra o stream SSE, para o ping e libera o listener", async () => {
      // Contador PRÓPRIO: o `unsubscribed` compartilhado recebe limpezas tardias de outros testes.
      const offs = vi.fn();
      const ownEvents = {
        ...events,
        subscribeOrders: (
          ...args: Parameters<typeof realEvents.subscribeOrders>
        ) => {
          const off = realEvents.subscribeOrders(...args);
          return () => {
            off();
            offs();
          };
        },
      };
      const closing = await createControllerTestApp({
        controllers: [OrderController],
        providers: [
          { provide: OrderService, useValue: service },
          { provide: OrderEvents, useValue: ownEvents },
        ],
      });
      await closing.listen(0);
      const { port } = closing.getHttpServer().address() as { port: number };
      let ended = false;
      const req = httpRequest({
        host: "127.0.0.1",
        port,
        path: "/api/orders/stream",
        headers: { Authorization: auth() },
      });
      await new Promise<void>((resolve, reject) => {
        req.on("response", (res) => {
          res.on("end", () => {
            ended = true;
          });
          res.resume();
          resolve();
        });
        req.on("error", reject);
        req.end();
      });

      const closed = closing.close().then(() => "closed" as const);
      const hung = new Promise<"hung">((r) =>
        setTimeout(() => r("hung"), 3000),
      );

      await expect(Promise.race([closed, hung])).resolves.toBe("closed");
      await vi.waitFor(() => expect(ended).toBe(true));
      expect(offs).toHaveBeenCalledTimes(1);
    });
  });
});
