import { createHmac } from "node:crypto";

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

const processWebhook = vi.fn();

const { WhatsAppController } = await import("./whatsapp.controller.js");
const { WhatsAppService } = await import("../services/whatsapp.service.js");
const { env } = await import("../../../config/env.js");
const { createControllerTestApp } = await import("../../../test/nestApp.js");
const APP_SECRET = "controller-secret";
const VERIFY_TOKEN = "controller-verify";

// Espaço duplo e unicode: JSON.stringify(JSON.parse(x)) NÃO reproduz estes bytes.
const BODY = '{"object":"whatsapp_business_account",  "entry":[],"n":"olá"}';
const sign = (payload: string, secret = APP_SECRET) =>
  `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

describe("whatsapp controller", () => {
  let app: Awaited<ReturnType<typeof createControllerTestApp>>;
  const original = { ...env.whatsapp };

  beforeAll(async () => {
    env.whatsapp.appSecret = APP_SECRET;
    env.whatsapp.verifyToken = VERIFY_TOKEN;
    app = await createControllerTestApp({
      controllers: [WhatsAppController],
      providers: [{ provide: WhatsAppService, useValue: { processWebhook } }],
    });
  });
  afterAll(async () => {
    Object.assign(env.whatsapp, original);
    await app.close();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    processWebhook.mockResolvedValue(undefined as never);
  });

  const http = () => app.getHttpServer();

  describe("GET /webhooks/whatsapp (handshake)", () => {
    const query = (over: Record<string, string> = {}) => ({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "12345",
      ...over,
    });

    it("echoes the challenge as plain text when the token matches", async () => {
      const res = await request(http())
        .get("/webhooks/whatsapp")
        .query(query());

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/plain");
      expect(res.text).toBe("12345");
    });

    it.each([
      ["wrong token", { "hub.verify_token": "outro" }],
      ["wrong mode", { "hub.mode": "unsubscribe" }],
    ])("403 invalid_verify_token on %s", async (_name, over) => {
      const res = await request(http())
        .get("/webhooks/whatsapp")
        .query(query(over));

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        status: "forbidden",
        code: "invalid_verify_token",
      });
    });

    it("403 when the challenge is missing", async () => {
      const q: Record<string, string> = query();
      delete q["hub.challenge"];

      const res = await request(http()).get("/webhooks/whatsapp").query(q);

      expect(res.status).toBe(403);
    });

    it("fails closed: no verify token configured → 403 even if the request sends an empty one", async () => {
      env.whatsapp.verifyToken = "";
      try {
        const res = await request(http())
          .get("/webhooks/whatsapp")
          .query(query({ "hub.verify_token": "" }));

        expect(res.status).toBe(403);
      } finally {
        env.whatsapp.verifyToken = VERIFY_TOKEN;
      }
    });
  });

  describe("POST /webhooks/whatsapp", () => {
    const post = (payload: string, signature?: string) => {
      const req = request(http())
        .post("/webhooks/whatsapp")
        .set("Content-Type", "application/json");
      if (signature) req.set("X-Hub-Signature-256", signature);
      return req.send(payload);
    };

    it("accepts a signature over the original bytes, answers 200 and processes the parsed body", async () => {
      const res = await post(BODY, sign(BODY));

      expect(res.status).toBe(200);
      expect(res.text).toBe("OK");
      expect(processWebhook).toHaveBeenCalledWith({
        object: "whatsapp_business_account",
        entry: [],
        n: "olá",
      });
    });

    it("answers 200 BEFORE processing finishes (processing never resolves)", async () => {
      processWebhook.mockReturnValue(new Promise(() => {}) as never);

      const res = await post(BODY, sign(BODY));

      expect(res.status).toBe(200);
    });

    it("a processing failure is logged and swallowed, never a 500 nor an unhandled rejection", async () => {
      const logged = vi
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});
      processWebhook.mockRejectedValue(new Error("llm down"));

      const res = await post(BODY, sign(BODY));

      expect(res.status).toBe(200);
      await vi.waitFor(() => expect(logged).toHaveBeenCalled());
      logged.mockRestore();
    });

    it("403 invalid_signature for a signature over the re-serialized JSON, and NOTHING is processed", async () => {
      const reserialized = JSON.stringify(JSON.parse(BODY));
      expect(reserialized).not.toBe(BODY);

      const res = await post(BODY, sign(reserialized));

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("invalid_signature");
      expect(processWebhook).not.toHaveBeenCalled();
    });

    it("403 for a signature made with another secret", async () => {
      const res = await post(BODY, sign(BODY, "outro-segredo"));

      expect(res.status).toBe(403);
      expect(processWebhook).not.toHaveBeenCalled();
    });

    it("403 without the signature header", async () => {
      const res = await post(BODY);

      expect(res.status).toBe(403);
      expect(processWebhook).not.toHaveBeenCalled();
    });

    it("fails closed: no app secret configured → 403 for any signature", async () => {
      env.whatsapp.appSecret = "";
      try {
        const res = await post(BODY, sign(BODY, ""));

        expect(res.status).toBe(403);
        expect(processWebhook).not.toHaveBeenCalled();
      } finally {
        env.whatsapp.appSecret = APP_SECRET;
      }
    });
  });
});
