import { createHmac } from "node:crypto";

import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prova a matriz de guardas do mount. Chamar o handler direto (o padrão dos
 * outros testes de controller) não pega uma rota montada sem guard: só o
 * roteador montado sabe se ele está lá.
 */
vi.mock("../config/db.js", () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  pool: { connect: vi.fn(), end: vi.fn() },
}));

vi.mock("../modules/ai/ollama-client.js", () => ({
  createChatLlm: vi.fn(),
}));

vi.mock("../modules/whatsapp/whatsapp.service.js", () => ({
  processWebhook: vi.fn(async () => {}),
}));

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";
vi.stubEnv("WHATSAPP_APP_SECRET", APP_SECRET);
vi.stubEnv("WHATSAPP_VERIFY_TOKEN", VERIFY_TOKEN);

const { signAuthToken } = await import("../modules/auth/jwt.js");
const { processWebhook } =
  await import("../modules/whatsapp/whatsapp.service.js");
const { createServer } = await import("./server.js");

const app = createServer();
const TOKEN = signAuthToken({ userId: 1, tenantId: 1 });

beforeEach(() => {
  vi.clearAllMocks();
});

const GUARDED: [string, string][] = [
  ["get", "/api/settings"],
  ["put", "/api/settings"],
  ["get", "/api/simulator/conversation"],
  ["delete", "/api/simulator/conversation"],
  ["post", "/api/simulator/messages"],
];

describe("rotas autenticadas", () => {
  it.each(GUARDED)("%s %s responde 401 sem token", async (method, path) => {
    const res = await (
      request(app) as unknown as Record<string, (p: string) => request.Test>
    )[method]!(path);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: "unauthorized",
      code: "missing_token",
    });
  });

  it("GET /api/settings deixa passar com token válido", async () => {
    const res = await request(app)
      .get("/api/settings")
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(res.status).not.toBe(401);
  });

  it("responde 401 com code e SEM message em header malformado", async () => {
    const res = await request(app)
      .get("/api/settings")
      .set("Authorization", "Bearer lixo");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_token");
    expect(res.body).not.toHaveProperty("message");
  });

  it("POST /api/simulator/messages sem texto responde 422 text_required", async () => {
    const res = await request(app)
      .post("/api/simulator/messages")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ text: "  " });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "text_required", field: "text" });
  });
});

describe("rotas públicas", () => {
  it("GET /health responde sem token (é o healthcheck do compose)", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("POST /api/auth/login é público e recusa credencial inválida com 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ninguem@admin.com", password: "errada" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
  });

  it("GET /api/auth/me exige token", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
  });
});

describe("webhook do WhatsApp", () => {
  it("GET devolve o challenge quando o verify_token confere", async () => {
    const res = await request(app).get("/webhooks/whatsapp").query({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "12345",
    });

    expect(res.status).toBe(200);
    expect(res.text).toBe("12345");
  });

  it("GET recusa verify_token errado com 403", async () => {
    const res = await request(app).get("/webhooks/whatsapp").query({
      "hub.mode": "subscribe",
      "hub.verify_token": "errado",
      "hub.challenge": "12345",
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("invalid_verify_token");
  });

  it("POST assinado sobre o corpo cru responde 200 e processa", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [],
    });
    const signature = `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(processWebhook).toHaveBeenCalledWith({
      object: "whatsapp_business_account",
      entry: [],
    });
  });

  it("POST sem assinatura válida responde 403 e NÃO processa", async () => {
    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("X-Hub-Signature-256", "sha256=deadbeef")
      .send({ object: "whatsapp_business_account", entry: [] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("invalid_signature");
    expect(processWebhook).not.toHaveBeenCalled();
  });
});
